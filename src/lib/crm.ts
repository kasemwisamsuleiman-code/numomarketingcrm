/** Daily lead generation goal for the agency workflow. */
export const DAILY_TARGET = 50;

export const LEAD_STATUSES = [
  "READY",
  "PENDING",
  "CONTACTED",
  "REPLIED",
  "MEETING SET",
  "CLIENT",
  "NOT INTERESTED",
  "NOT ANSWERED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const MEETING_STATUSES = ["SCHEDULED", "CONFIRMED", "COMPLETED", "NO SHOW", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const CLIENT_STATUSES = ["ACTIVE", "ONBOARDING", "PAUSED", "CHURNED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIALLY PAID", "PAID", "OVERDUE", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Tailwind classes per status pill, all built from design-system tokens. */
export const STATUS_TONE: Record<string, string> = {
  READY: "bg-gold-soft text-gold-foreground border-gold/40",
  PENDING: "bg-muted text-muted-foreground border-border",
  CONTACTED: "bg-info/15 text-info border-info/30",
  REPLIED: "bg-accent text-accent-foreground border-gold/40",
  "MEETING SET": "bg-gold/25 text-gold-foreground border-gold/50",
  CLIENT: "bg-success/15 text-success border-success/30",
  "NOT INTERESTED": "bg-destructive/12 text-destructive border-destructive/25",
  "NOT ANSWERED": "bg-warning/20 text-gold-foreground border-warning/40",
  SCHEDULED: "bg-info/15 text-info border-info/30",
  CONFIRMED: "bg-gold/25 text-gold-foreground border-gold/50",
  COMPLETED: "bg-success/15 text-success border-success/30",
  "NO SHOW": "bg-warning/20 text-gold-foreground border-warning/40",
  CANCELLED: "bg-destructive/12 text-destructive border-destructive/25",
  ACTIVE: "bg-success/15 text-success border-success/30",
  ONBOARDING: "bg-gold/25 text-gold-foreground border-gold/50",
  PAUSED: "bg-warning/20 text-gold-foreground border-warning/40",
  CHURNED: "bg-destructive/12 text-destructive border-destructive/25",
  DRAFT: "bg-muted text-muted-foreground border-border",
  SENT: "bg-info/15 text-info border-info/30",
  "PARTIALLY PAID": "bg-warning/20 text-gold-foreground border-warning/40",
  PAID: "bg-success/15 text-success border-success/30",
  OVERDUE: "bg-destructive/12 text-destructive border-destructive/25",
  VOID: "bg-muted text-muted-foreground border-border",
};

export type LineItem = { description: string; quantity: number; rate: number };

export function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function computeInvoiceTotals(
  items: LineItem[],
  discountPercent: number,
  taxPercent: number,
  amountPaid: number,
) {
  const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0);
  const discount = subtotal * ((Number(discountPercent) || 0) / 100);
  const taxed = subtotal - discount;
  const tax = taxed * ((Number(taxPercent) || 0) / 100);
  const total = taxed + tax;
  const balance = total - (Number(amountPaid) || 0);
  return { subtotal, discount, tax, total, balance };
}

export function nextInvoiceNumber(existing: string[]) {
  const year = new Date().getFullYear();
  const prefix = `NUMO-${year}-`;
  const highest = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

/** Parse free-text business hours against "now" and return open state, or null when unsure. */
export function computeOpenState(hours: string | null | undefined, now: Date = new Date()): boolean | null {
  const text = (hours ?? "").trim();
  if (!text) return null;

  const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
  const DAY_ALIASES: Record<string, number> = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
  };
  const dayToken = /sun(day)?|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(r|rs|rsday|sday)?|fri(day)?|sat(urday)?/i;

  // Split into per-segment parts: "Mon–Fri: 9–5; Sat: 10–2" etc.
  const segments = text
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const today = now.getDay();

  let segmentMatched = false;
  let foundSignal = false;
  let open = false;

  for (const seg of segments) {
    // Find the day coverage of this segment.
    const dayMatch = seg.match(new RegExp(`^(${dayToken.source})?\\s*(?:[-–—/to]+\\s*(${dayToken.source}))?`, "i"));
    let covered = true;
    if (dayMatch && (dayMatch[1] || dayMatch[2])) {
      const start = dayMatch[1] ? DAY_ALIASES[dayMatch[1].toLowerCase() as string] : undefined;
      const end = dayMatch[2] ? DAY_ALIASES[dayMatch[2].toLowerCase() as string] : undefined;
      if (start === undefined && end === undefined) covered = true;
      else if (start !== undefined && end === undefined) covered = today === start;
      else if (start === undefined && end !== undefined) covered = today === end;
      else {
        // range, possibly wrapping past Saturday
        covered =
          start! <= end! ? today >= start! && today <= end! : today >= start! || today <= end!;
      }
    }
    if (!covered) continue;
    segmentMatched = true;

    if (/closed/i.test(seg)) {
      foundSignal = true;
      open = false;
      continue;
    }
    if (/open\s*24|24\s*hours?/i.test(seg)) {
      return true;
    }

    // Parse time range(s) like "9am-5pm", "9:00 AM – 5:30 PM", "09:00-17:00".
    const timeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/gi;
    const times: number[] = [];
    const timeMatches = seg.replace(/closed|open/gi, "").match(/(\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?)/gi);
    if (!timeMatches) continue;
    const m = seg.matchAll(timeRe);
    for (const t of m) {
      let h = parseInt(t[1] ?? "", 10);
      const min = t[2] ? parseInt(t[2], 10) : 0;
      const meridiem = t[3]?.toLowerCase().replace(/\./g, "");
      if (meridiem === "pm" && h < 12) h += 12;
      if (meridiem === "am" && h === 12) h = 0;
      if (h > 23 || min > 59) continue;
      times.push(h * 60 + min);
      if (times.length === 2) break;
    }
    if (times.length < 2) continue;
    foundSignal = true;
    const startMin = times[0] as number;
    const endMin = times[1] as number;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const within = startMin <= endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin;
    if (within) open = true;
  }

  if (!segmentMatched || !foundSignal) return null;
  return open;
}

export function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toLocalInputValue(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
