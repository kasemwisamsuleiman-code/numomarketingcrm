import { supabase } from "@/integrations/supabase/client";
import { dedupeKeys, findDuplicateIds, isDuplicateOf, websiteHost } from "@/lib/dedupe";

export { dedupeKeys, findDuplicateIds, isDuplicateOf, websiteHost };

/**
 * Outreach queue state machine (phase 1 — simulation only).
 * No external email/SMS provider is contacted anywhere in this module.
 */
export const OUTREACH_STATES = ["NOT_QUEUED", "QUEUED", "CONTACTED", "REPLIED", "STOPPED"] as const;
export type OutreachState = (typeof OUTREACH_STATES)[number];

export const OUTREACH_CHANNELS = ["EMAIL", "SMS", "CALL"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_TONE: Record<string, string> = {
  NOT_QUEUED: "bg-muted text-muted-foreground border-border",
  QUEUED: "bg-gold-soft text-gold-foreground border-gold/40",
  CONTACTED: "bg-info/15 text-info border-info/30",
  REPLIED: "bg-success/15 text-success border-success/30",
  STOPPED: "bg-destructive/12 text-destructive border-destructive/25",
};

/** Default gap before a follow-up is due after a simulated send. */
export const FOLLOW_UP_DAYS = 3;

export type OutreachLead = {
  id: string;
  business_name: string;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  outreach_channel: string | null;
  outreach_status: string;
  queued_at: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  reply_detected: boolean;
  stop_outreach: boolean;
  outreach_attempts: number;
  lead_score: number | null;
};

export const OUTREACH_SELECT =
  "id, business_name, category, location, phone, email, website, status, outreach_channel, outreach_status, queued_at, last_contacted_at, next_follow_up_at, reply_detected, stop_outreach, outreach_attempts, lead_score";

export type AutomationLog = {
  id: string;
  lead_id: string | null;
  lead_name: string;
  action: string;
  channel: string | null;
  result: string;
  detail: string | null;
  created_at: string;
};

export async function logAutomation(entry: {
  userId: string;
  leadId: string | null;
  leadName: string;
  action: string;
  channel?: string | null;
  result?: string;
  detail?: string | null;
}) {
  const { error } = await supabase.from("automation_logs").insert({
    user_id: entry.userId,
    lead_id: entry.leadId,
    lead_name: entry.leadName,
    action: entry.action,
    channel: entry.channel ?? null,
    result: entry.result ?? "SUCCESS",
    detail: entry.detail ?? null,
  });
  if (error) throw error;
}

function iso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Queue a lead for a channel. Tracker status stays READY until a send happens. */
export async function queueLead(userId: string, lead: OutreachLead, channel: OutreachChannel) {
  if (lead.stop_outreach) throw new Error(`${lead.business_name} has outreach stopped.`);
  if (channel === "EMAIL" && !lead.email) throw new Error(`${lead.business_name} has no email address.`);
  if (channel === "SMS" && !lead.phone) throw new Error(`${lead.business_name} has no phone number.`);

  const { error } = await supabase
    .from("leads")
    .update({
      outreach_status: "QUEUED",
      outreach_channel: channel,
      queued_at: iso(),
      status: lead.status === "PENDING" || lead.status === "READY" ? "READY" : lead.status,
    })
    .eq("id", lead.id);
  if (error) throw error;

  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: "QUEUED",
    channel,
    detail: "Queued for outreach (no message sent)",
  });
}

/** Remove a lead from the queue without stopping it permanently. */
export async function unqueueLead(userId: string, lead: OutreachLead) {
  const { error } = await supabase
    .from("leads")
    .update({ outreach_status: "NOT_QUEUED", queued_at: null, next_follow_up_at: null })
    .eq("id", lead.id);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: "UNQUEUED",
    channel: lead.outreach_channel,
    detail: "Removed from outreach queue",
  });
}

/**
 * Simulated send. This is a dry run: it only advances local state and writes a
 * log entry — no email or SMS provider is called.
 */
export async function simulateSend(userId: string, lead: OutreachLead) {
  if (lead.stop_outreach) throw new Error(`${lead.business_name} has outreach stopped.`);
  const channel = (lead.outreach_channel as OutreachChannel | null) ?? "EMAIL";
  const now = iso();
  const { error } = await supabase
    .from("leads")
    .update({
      outreach_status: "CONTACTED",
      status: lead.status === "READY" || lead.status === "PENDING" ? "CONTACTED" : lead.status,
      outreach_channel: channel,
      last_contacted_at: now,
      next_follow_up_at: iso(FOLLOW_UP_DAYS * 86_400_000),
      outreach_attempts: (lead.outreach_attempts ?? 0) + 1,
    })
    .eq("id", lead.id);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: "SEND_SIMULATED",
    channel,
    result: "SIMULATED",
    detail: `Dry run — no ${channel.toLowerCase()} was actually sent`,
  });
}

/** Simulated follow-up touch on an already-contacted lead. */
export async function simulateFollowUp(userId: string, lead: OutreachLead) {
  if (lead.stop_outreach) throw new Error(`${lead.business_name} has outreach stopped.`);
  const channel = (lead.outreach_channel as OutreachChannel | null) ?? "EMAIL";
  const { error } = await supabase
    .from("leads")
    .update({
      outreach_status: "CONTACTED",
      last_contacted_at: iso(),
      next_follow_up_at: iso(FOLLOW_UP_DAYS * 86_400_000),
      outreach_attempts: (lead.outreach_attempts ?? 0) + 1,
    })
    .eq("id", lead.id);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: "FOLLOW_UP_SIMULATED",
    channel,
    result: "SIMULATED",
    detail: "Dry run follow-up — nothing was sent",
  });
}

/** Mark a reply: sets REPLIED and permanently stops further outreach. */
export async function markReplied(userId: string, lead: OutreachLead) {
  const { error } = await supabase
    .from("leads")
    .update({
      outreach_status: "REPLIED",
      status: lead.status === "MEETING SET" || lead.status === "CLIENT" ? lead.status : "REPLIED",
      reply_detected: true,
      stop_outreach: true,
      next_follow_up_at: null,
    })
    .eq("id", lead.id);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: "REPLY_DETECTED",
    channel: lead.outreach_channel,
    detail: "Reply recorded — future outreach stopped",
  });
}

/** Manual stop / resume switch. */
export async function setStopOutreach(userId: string, lead: OutreachLead, stop: boolean) {
  const { error } = await supabase
    .from("leads")
    .update({
      stop_outreach: stop,
      outreach_status: stop ? "STOPPED" : lead.last_contacted_at ? "CONTACTED" : "NOT_QUEUED",
      next_follow_up_at: stop ? null : lead.next_follow_up_at,
    })
    .eq("id", lead.id);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: stop ? "OUTREACH_STOPPED" : "OUTREACH_RESUMED",
    channel: lead.outreach_channel,
    detail: stop ? "Lead excluded from all outreach" : "Lead re-enabled for outreach",
  });
}

/** Called when a meeting is created for a lead: MEETING SET + stop outreach. */
export async function applyMeetingSet(userId: string, leadId: string, leadName: string) {
  const { error } = await supabase
    .from("leads")
    .update({ status: "MEETING SET", stop_outreach: true, outreach_status: "STOPPED", next_follow_up_at: null })
    .eq("id", leadId);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId,
    leadName,
    action: "MEETING_SET",
    detail: "Meeting booked — outreach stopped",
  });
}

/** Called when a lead becomes a client: CLIENT + stop outreach. */
export async function applyConverted(userId: string, leadId: string, leadName: string) {
  const { error } = await supabase
    .from("leads")
    .update({ status: "CLIENT", stop_outreach: true, outreach_status: "STOPPED", next_follow_up_at: null })
    .eq("id", leadId);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId,
    leadName,
    action: "CONVERTED_TO_CLIENT",
    detail: "Lead converted to client — outreach stopped",
  });
}

export function isFollowUpDue(lead: OutreachLead, now = Date.now()) {
  return (
    !lead.stop_outreach &&
    lead.outreach_status === "CONTACTED" &&
    !!lead.next_follow_up_at &&
    new Date(lead.next_follow_up_at).getTime() <= now
  );
}
