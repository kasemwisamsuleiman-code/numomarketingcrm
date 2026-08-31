import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildEmail,
  bodyToHtml,
  isValidEmail,
  withinSendingHours,
  type EmailKind,
  type EmailSettings,
} from "@/lib/email-template";

const BLOCKED_STATUSES = ["REPLIED", "MEETING SET", "CLIENT", "NOT INTERESTED"];

/** Provider + domain readiness. Never returns any key material. */
export const getEmailProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { hasResend, verifyResendKey } = await import("./email.server");
    if (!hasResend()) {
      return { configured: false, verified: false, domains: [] as string[], message: "No RESEND_API_KEY secret is configured." };
    }
    const { ok, status, domains } = await verifyResendKey();
    return {
      configured: true,
      verified: ok,
      domains,
      message: ok
        ? domains.length
          ? `Resend connected. Verified sending domains: ${domains.join(", ")}.`
          : "Resend connected, but no verified sending domain was found. Verify a domain in Resend before sending."
        : `Resend rejected the configured key (${status}).`,
    };
  });

async function loadSettings(supabase: {
  from: (t: string) => any;
}, userId: string): Promise<EmailSettings> {
  const { data, error } = await supabase.from("email_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as EmailSettings;
  const { data: created, error: insertError } = await supabase
    .from("email_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  return created as EmailSettings;
}

function siteOrigin() {
  try {
    const url = new URL(getRequest().url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

/** Owner-initiated test email. Only ever goes to the address typed in the UI. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string; kind?: EmailKind }) => {
    const to = String(input?.to ?? "").trim();
    if (!isValidEmail(to)) throw new Error("Enter a valid test email address.");
    const kind: EmailKind = input?.kind === "FOLLOW_UP" ? "FOLLOW_UP" : "INITIAL";
    return { to, kind };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings(supabase as never, userId);
    if (!isValidEmail(settings.from_email)) throw new Error("Set a valid From email in Settings first.");

    const { sendEmailViaResend } = await import("./email.server");
    const { subject, body } = buildEmail(settings, {
      business_name: "Sample Business",
      category: "restaurant",
      location: "Portland, OR",
      personalized_line: "This is a test send from your Numo CRM email setup.",
    }, data.kind);

    const preview = `[TEST] ${subject}`;
    try {
      const result = await sendEmailViaResend({
        fromName: settings.from_name,
        fromEmail: settings.from_email,
        replyTo: settings.reply_to || null,
        to: data.to,
        subject: preview,
        text: body,
        html: bodyToHtml(body),
      });
      await supabase.from("email_sends").insert({
        user_id: userId,
        lead_id: null,
        lead_name: "Test email",
        to_email: data.to,
        subject: preview,
        body,
        kind: "TEST",
        provider_message_id: result.id,
        status: "SENT",
        sent_at: new Date().toISOString(),
      });
      return { ok: true, messageId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed.";
      await supabase.from("email_sends").insert({
        user_id: userId,
        lead_id: null,
        lead_name: "Test email",
        to_email: data.to,
        subject: preview,
        body,
        kind: "TEST",
        status: "FAILED",
        error: message,
      });
      throw new Error(message);
    }
  });

/**
 * Manual, one-lead real send. Every guard is re-checked server-side; the lead is
 * only marked CONTACTED after the provider accepts the message.
 */
export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { leadId: string; kind?: EmailKind }) => {
    const leadId = String(input?.leadId ?? "").trim();
    if (!leadId) throw new Error("Lead is required.");
    const kind: EmailKind = input?.kind === "FOLLOW_UP" ? "FOLLOW_UP" : "INITIAL";
    return { leadId, kind };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await loadSettings(supabase as never, userId);

    if (!settings.live_enabled) throw new Error("Live email outreach is disabled. Enable it in Settings first.");
    if (!isValidEmail(settings.from_email)) throw new Error("Set a valid From email in Settings first.");
    if (!withinSendingHours(settings))
      throw new Error(
        `Outside your sending window (${settings.send_start_hour}:00–${settings.send_end_hour}:00 ${settings.timezone}).`,
      );

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id, business_name, category, location, email, personalized_line, status, outreach_status, outreach_channel, stop_outreach, reply_detected, outreach_attempts",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead not found.");

    if (lead.stop_outreach) throw new Error(`${lead.business_name} has outreach stopped.`);
    if (lead.reply_detected) throw new Error(`${lead.business_name} already replied — outreach is stopped.`);
    if (BLOCKED_STATUSES.includes(lead.status)) throw new Error(`${lead.business_name} is ${lead.status}; sending is blocked.`);
    if (!isValidEmail(lead.email)) throw new Error(`${lead.business_name} has no valid email address.`);
    if ((lead.outreach_channel ?? "EMAIL") !== "EMAIL") throw new Error(`${lead.business_name} is queued for ${lead.outreach_channel}, not email.`);
    if (data.kind === "INITIAL" && lead.outreach_status !== "QUEUED")
      throw new Error(`${lead.business_name} must be queued for email before the first send.`);
    if (data.kind === "FOLLOW_UP" && lead.outreach_status !== "CONTACTED")
      throw new Error(`${lead.business_name} has not been contacted yet.`);

    const attemptNo = (lead.outreach_attempts ?? 0) + 1;
    if (data.kind === "FOLLOW_UP" && (lead.outreach_attempts ?? 0) > settings.max_follow_ups)
      throw new Error(`${lead.business_name} reached the maximum of ${settings.max_follow_ups} follow-ups.`);

    const to = lead.email!.trim();

    const { data: suppressed } = await supabase
      .from("email_suppressions")
      .select("id, reason")
      .eq("user_id", userId)
      .ilike("email", to)
      .maybeSingle();
    if (suppressed) throw new Error(`${to} is suppressed (${suppressed.reason}) and will never be emailed.`);

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "SENT")
      .neq("kind", "TEST")
      .gte("created_at", since.toISOString());
    if ((count ?? 0) >= settings.daily_cap)
      throw new Error(`Daily sending cap of ${settings.daily_cap} emails has been reached.`);

    const { makeUnsubscribeToken, sendEmailViaResend } = await import("./email.server");
    const origin = siteOrigin();
    const token = await makeUnsubscribeToken(userId, to);
    const unsubscribeUrl = origin ? `${origin}/api/public/unsubscribe?t=${encodeURIComponent(token)}` : undefined;

    const { subject, body } = buildEmail(settings, lead, data.kind);

    let messageId = "";
    try {
      const result = await sendEmailViaResend({
        fromName: settings.from_name,
        fromEmail: settings.from_email,
        replyTo: settings.reply_to || null,
        to,
        subject,
        text: unsubscribeUrl ? `${body}\n\n---\nUnsubscribe: ${unsubscribeUrl}` : body,
        html: bodyToHtml(body, unsubscribeUrl),
      });
      messageId = result.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed.";
      await supabase.from("email_sends").insert({
        user_id: userId,
        lead_id: lead.id,
        lead_name: lead.business_name,
        to_email: to,
        subject,
        body,
        kind: data.kind,
        status: "FAILED",
        error: message,
        attempt_no: attemptNo,
      });
      await supabase.from("automation_logs").insert({
        user_id: userId,
        lead_id: lead.id,
        lead_name: lead.business_name,
        action: data.kind === "INITIAL" ? "EMAIL_SEND_FAILED" : "EMAIL_FOLLOW_UP_FAILED",
        channel: "EMAIL",
        result: "FAILED",
        detail: message,
      });
      throw new Error(message);
    }

    const now = new Date();
    const nextFollowUp = new Date(now.getTime() + settings.follow_up_delay_days * 86_400_000);

    await supabase.from("email_sends").insert({
      user_id: userId,
      lead_id: lead.id,
      lead_name: lead.business_name,
      to_email: to,
      subject,
      body,
      kind: data.kind,
      provider_message_id: messageId,
      status: "SENT",
      sent_at: now.toISOString(),
      attempt_no: attemptNo,
    });

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        outreach_status: "CONTACTED",
        outreach_channel: "EMAIL",
        status: lead.status === "READY" || lead.status === "PENDING" ? "CONTACTED" : lead.status,
        last_contacted_at: now.toISOString(),
        next_follow_up_at: nextFollowUp.toISOString(),
        outreach_attempts: attemptNo,
      })
      .eq("id", lead.id);
    if (updateError) throw new Error(`Email sent, but updating the lead failed: ${updateError.message}`);

    await supabase.from("automation_logs").insert({
      user_id: userId,
      lead_id: lead.id,
      lead_name: lead.business_name,
      action: data.kind === "INITIAL" ? "EMAIL_SENT" : "EMAIL_FOLLOW_UP_SENT",
      channel: "EMAIL",
      result: "SENT",
      detail: `Delivered to provider — message id ${messageId}`,
    });

    return { ok: true, messageId, to, subject };
  });

/** Manually suppress an address (never emailed again for this workspace). */
export const suppressEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; reason?: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
    return { email, reason: String(input?.reason ?? "MANUAL").slice(0, 40) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("email_suppressions")
      .insert({ user_id: userId, email: data.email, reason: data.reason });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    await supabase
      .from("leads")
      .update({ stop_outreach: true, outreach_status: "STOPPED", next_follow_up_at: null })
      .eq("user_id", userId)
      .ilike("email", data.email);
    return { ok: true };
  });

/** Delivery outcome for one already-sent message (delivered, bounced, complained, ...). */
export const getEmailDeliveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => {
    const messageId = String(input?.messageId ?? "").trim();
    if (!messageId) throw new Error("Message id is required.");
    return { messageId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("email_sends")
      .select("id")
      .eq("user_id", userId)
      .eq("provider_message_id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That message is not part of this workspace.");
    const { fetchEmailDelivery } = await import("./email.server");
    return fetchEmailDelivery(data.messageId);
  });
