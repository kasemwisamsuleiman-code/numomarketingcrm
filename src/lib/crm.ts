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
