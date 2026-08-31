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
  sequence_step: number;
  opted_out: boolean;
  sms_consent: boolean;
  lead_score: number | null;
};

/** Tracker statuses that permanently end outreach for a lead. */
export const TERMINAL_STATUSES = ["REPLIED", "MEETING SET", "CLIENT", "NOT INTERESTED"];

/** Can this lead legally/logically receive another outreach touch on this channel? */
export function isEligibleForOutreach(lead: OutreachLead, channel?: OutreachChannel | null) {
  if (lead.stop_outreach || lead.opted_out || lead.reply_detected) return false;
  if (TERMINAL_STATUSES.includes(lead.status)) return false;
  const ch = channel ?? (lead.outreach_channel as OutreachChannel | null) ?? "EMAIL";
  if (ch === "EMAIL") return Boolean(lead.email);
  if (ch === "SMS") return Boolean(lead.phone) && lead.sms_consent === true;
  return Boolean(lead.phone);
}

export const OUTREACH_SELECT =
  "id, business_name, category, location, phone, email, website, status, outreach_channel, outreach_status, queued_at, last_contacted_at, next_follow_up_at, reply_detected, stop_outreach, outreach_attempts, sequence_step, opted_out, sms_consent, lead_score";

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
  if (lead.opted_out) throw new Error(`${lead.business_name} opted out of outreach.`);
  if (TERMINAL_STATUSES.includes(lead.status)) throw new Error(`${lead.business_name} is ${lead.status} — outreach is closed.`);
  if (channel === "SMS" && !lead.sms_consent)
    throw new Error(`${lead.business_name} has no recorded SMS consent. SMS requires a compliant opt-in.`);
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
      sequence_step: (lead.sequence_step ?? 0) + 1,
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
      sequence_step: (lead.sequence_step ?? 0) + 1,
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

/** Record an opt-out (unsubscribe / STOP). Permanently blocks all future outreach. */
export async function optOutLead(userId: string, lead: OutreachLead, detail = "Opted out") {
  const { error } = await supabase
    .from("leads")
    .update({
      opted_out: true,
      opted_out_at: new Date().toISOString(),
      stop_outreach: true,
      outreach_status: "STOPPED",
      next_follow_up_at: null,
      status: lead.status === "CLIENT" || lead.status === "MEETING SET" ? lead.status : "NOT INTERESTED",
    })
    .eq("id", lead.id);
  if (error) throw error;
  if (lead.phone) {
    await supabase
      .from("sms_suppressions")
      .upsert({ user_id: userId, phone: lead.phone, reason: "STOP", detail }, { onConflict: "user_id,phone" });
  }
  if (lead.email) {
    await supabase
      .from("email_suppressions")
      .upsert({ user_id: userId, email: lead.email.trim().toLowerCase(), reason: "UNSUBSCRIBE", detail });
  }
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: "OPTED_OUT",
    channel: lead.outreach_channel,
    detail,
  });
}

/** Record (or revoke) a compliant SMS consent basis for a lead. */
export async function setSmsConsent(userId: string, lead: OutreachLead, consent: boolean, source: string) {
  const { error } = await supabase
    .from("leads")
    .update({
      sms_consent: consent,
      sms_consent_source: consent ? source : null,
      sms_consent_at: consent ? new Date().toISOString() : null,
    })
    .eq("id", lead.id);
  if (error) throw error;
  await logAutomation({
    userId,
    leadId: lead.id,
    leadName: lead.business_name,
    action: consent ? "SMS_CONSENT_RECORDED" : "SMS_CONSENT_REVOKED",
    channel: "SMS",
    detail: consent ? `Basis: ${source}` : "Consent revoked",
  });
}
