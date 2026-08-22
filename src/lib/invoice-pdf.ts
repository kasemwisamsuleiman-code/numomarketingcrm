import { jsPDF } from "jspdf";
import { formatDate, money, type LineItem } from "@/lib/crm";

export type InvoicePdfData = {
  invoice_number: string;
  client_name: string;
  client_email?: string | null;
  client_address?: string | null;
  issue_date: string;
  due_date?: string | null;
  line_items: LineItem[];
  subtotal: number;
  discount_percent: number;
  tax_percent: number;
  total: number;
  amount_paid: number;
  balance: number;
  status?: string;
  notes?: string | null;
};

/** Letter page geometry, in points. */
const PAGE_W = 612;
const PAGE_H = 792;
const M = 54; // 0.75in margins
const CONTENT_W = PAGE_W - M * 2;

// Column x positions (right edges for numeric columns).
const COL_DESC_X = M;
const COL_QTY_R = M + CONTENT_W * 0.6;
const COL_RATE_R = M + CONTENT_W * 0.8;
const COL_AMT_R = M + CONTENT_W;
const DESC_W = COL_QTY_R - COL_DESC_X - 70;

const INK: [number, number, number] = [26, 24, 21];
const MUTED: [number, number, number] = [122, 116, 105];
const LINE: [number, number, number] = [223, 217, 205];

export function buildInvoicePdf(inv: InvoicePdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = M;

  const header = () => {
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("NUMO MARKETING", M, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("I N V O I C E", M, y + 18);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(inv.invoice_number, PAGE_W - M, y + 2, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Issued ${formatDate(inv.issue_date)}`, PAGE_W - M, y + 16, { align: "right" });
    doc.text(`Due ${formatDate(inv.due_date)}`, PAGE_W - M, y + 29, { align: "right" });
    y += 46;
  };

  const tableHead = () => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.8);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text("DESCRIPTION", COL_DESC_X, y);
    doc.text("QTY", COL_QTY_R, y, { align: "right" });
    doc.text("RATE", COL_RATE_R, y, { align: "right" });
    doc.text("AMOUNT", COL_AMT_R, y, { align: "right" });
    y += 8;
    doc.line(M, y, PAGE_W - M, y);
    y += 14;
  };

  const newPage = () => {
    doc.addPage();
    y = M;
    header();
    tableHead();
  };

  header();

  // Bill to
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("BILL TO", M, y);
  y += 14;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(inv.client_name || "—", M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  if (inv.client_email) {
    doc.text(inv.client_email, M, y);
    y += 13;
  }
  if (inv.client_address) {
    for (const line of doc.splitTextToSize(inv.client_address, CONTENT_W * 0.6) as string[]) {
      doc.text(line, M, y);
      y += 13;
    }
  }

  y += 14;
  tableHead();

  // Line items
  doc.setFontSize(10);
  for (const item of inv.line_items) {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const lines = doc.splitTextToSize(item.description || "—", DESC_W) as string[];
    const rowH = Math.max(lines.length * 13, 16) + 8;
    if (y + rowH > PAGE_H - M - 40) newPage();

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    lines.forEach((line, i) => doc.text(line, COL_DESC_X, y + i * 13));
    doc.text(String(qty), COL_QTY_R, y, { align: "right" });
    doc.text(money(rate), COL_RATE_R, y, { align: "right" });
    doc.text(money(qty * rate), COL_AMT_R, y, { align: "right" });

    y += rowH - 6;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(M, y, PAGE_W - M, y);
    y += 16;
  }

  // Totals block
  const totals: [string, string, boolean][] = [
    ["Subtotal", money(Number(inv.subtotal)), false],
    ["Discount", `${Number(inv.discount_percent) || 0}%`, false],
    ["Tax", `${Number(inv.tax_percent) || 0}%`, false],
    ["Amount paid", money(Number(inv.amount_paid)), false],
    ["Total", money(Number(inv.total)), true],
    ["Balance due", money(Number(inv.balance)), true],
  ];
  const totalsH = totals.length * 17 + 12;
  if (y + totalsH > PAGE_H - M - 20) {
    doc.addPage();
    y = M;
    header();
  }
  const labelX = M + CONTENT_W * 0.6;
  for (const [label, value, strong] of totals) {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 11 : 10);
    doc.setTextColor(...(strong ? INK : MUTED));
    doc.text(label, labelX, y);
    doc.setTextColor(...INK);
    doc.text(value, COL_AMT_R, y, { align: "right" });
    y += 17;
  }

  // Notes
  if (inv.notes && inv.notes.trim()) {
    y += 14;
    const noteLines = doc.splitTextToSize(inv.notes.trim(), CONTENT_W) as string[];
    if (y + noteLines.length * 13 + 20 > PAGE_H - M) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("NOTES & PAYMENT TERMS", M, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    for (const line of noteLines) {
      doc.text(line, M, y);
      y += 13;
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text("Thank you for working with Numo Marketing.", PAGE_W / 2, PAGE_H - 34, { align: "center" });
    if (pages > 1) doc.text(`${p} / ${pages}`, PAGE_W - M, PAGE_H - 34, { align: "right" });
  }

  return doc;
}

export function downloadInvoicePdf(inv: InvoicePdfData) {
  buildInvoicePdf(inv).save(`${inv.invoice_number || "invoice"}.pdf`);
}
