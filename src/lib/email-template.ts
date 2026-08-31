/**
 * Pure email template helpers — shared by the settings editor, the preview
 * dialog and the server send path so the preview is byte-identical to the
 * email that actually goes out.
 */

export const TEMPLATE_VARIABLES = [
  "business_name",
  "category",
  "location",
  "personalized_line",
  "from_name",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type EmailSettings = {
  user_id: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  daily_cap: number;
  send_start_hour: number;
  send_end_hour: number;
  timezone: string;
  follow_up_delay_days: number;
  max_follow_ups: number;
  live_enabled: boolean;
  initial_subject: string;
  initial_body: string;
  follow_up_subject: string;
  follow_up_body: string;
};

export type TemplateLead = {
  business_name: string;
  category: string | null;
  location: string | null;
  personalized_line?: string | null;
};

export type EmailKind = "INITIAL" | "FOLLOW_UP";

/** Replace {{variable}} tokens. Unknown tokens are left untouched so typos are visible. */
export function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name: string) => {
    const key = name.toLowerCase();
    return key in vars ? vars[key]! : match;
  });
}

export function templateVars(lead: TemplateLead, fromName: string): Record<string, string> {
  return {
    business_name: lead.business_name || "there",
    category: lead.category?.trim() || "local",
    location: lead.location?.trim() || "your area",
    personalized_line: lead.personalized_line?.trim() || "I came across your business and liked what you're doing.",
    from_name: fromName || "Numo Marketing",
  };
}

/** Build the exact subject + plain-text body for a lead. */
export function buildEmail(settings: EmailSettings, lead: TemplateLead, kind: EmailKind) {
  const vars = templateVars(lead, settings.from_name);
  const subject = renderTemplate(kind === "INITIAL" ? settings.initial_subject : settings.follow_up_subject, vars).trim();
  const body = renderTemplate(kind === "INITIAL" ? settings.initial_body : settings.follow_up_body, vars).trim();
  return { subject, body };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal, deliverability-friendly HTML rendering of the plain-text body. */
export function bodyToHtml(body: string, unsubscribeUrl?: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const footer = unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#8a8580">Not interested? <a href="${unsubscribeUrl}" style="color:#8a8580">Unsubscribe</a>.</p>`
    : "";
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1c1a17;max-width:560px">${paragraphs}${footer}</div>`;
}

export function isValidEmail(value: string | null | undefined) {
  const v = (value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Current hour (0-23) in an IANA timezone; falls back to local time on bad input. */
export function hourInTimezone(timezone: string, date = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone });
    return Number(fmt.format(date));
  } catch {
    return date.getHours();
  }
}

export function withinSendingHours(settings: EmailSettings, date = new Date()) {
  const hour = hourInTimezone(settings.timezone, date);
  const { send_start_hour: start, send_end_hour: end } = settings;
  if (start === end) return true;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
