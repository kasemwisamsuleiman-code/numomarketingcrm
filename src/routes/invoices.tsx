import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Printer, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { StatusPill } from "@/components/crm/StatusPill";
import {
  INVOICE_STATUSES,
  computeInvoiceTotals,
  formatDate,
  money,
  nextInvoiceNumber,
  type InvoiceStatus,
  type LineItem,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Numo CRM" },
      { name: "description", content: "Create Numo Marketing invoices manually with automatic totals, tax and balance tracking." },
      { property: "og:title", content: "Invoices — Numo CRM" },
      { property: "og:description", content: "Manual invoice creation, numbering, PDF-ready preview and payment history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <InvoicesPage />
    </RequireAuth>
  ),
});

type Invoice = {
  id: string;
  invoice_number: string;
  client_id: string | null;
  client_name: string;
  client_email: string | null;
  client_address: string | null;
  issue_date: string;
  due_date: string | null;
  line_items: LineItem[];
  subtotal: number;
  discount_percent: number;
  tax_percent: number;
  total: number;
  amount_paid: number;
  balance: number;
  status: string;
  notes: string | null;
};

const blankItem: LineItem = { description: "", quantity: 1, rate: 0 };

type InvoiceForm = {
  invoice_number: string;
  client_id: string;
  client_name: string;
  client_email: string;
  client_address: string;
  issue_date: string;
  due_date: string;
  line_items: LineItem[];
  discount_percent: number;
  tax_percent: number;
  amount_paid: number;
  status: InvoiceStatus;
  notes: string;
};

function InvoicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("issue_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as Invoice[]).map((i) => ({
        ...i,
        line_items: Array.isArray(i.line_items) ? i.line_items : [],
      }));
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, email, address").order("name");
      if (error) throw error;
      return data as { id: string; name: string; email: string | null; address: string | null }[];
    },
  });

  const totals = form
    ? computeInvoiceTotals(form.line_items, form.discount_percent, form.tax_percent, form.amount_paid)
    : null;

  const save = useMutation({
    mutationFn: async (payload: InvoiceForm & { id?: string }) => {
      const t = computeInvoiceTotals(payload.line_items, payload.discount_percent, payload.tax_percent, payload.amount_paid);
      const row = {
        invoice_number: payload.invoice_number,
        client_id: payload.client_id === "NONE" ? null : payload.client_id,
        client_name: payload.client_name,
        client_email: payload.client_email || null,
        client_address: payload.client_address || null,
        issue_date: payload.issue_date,
        due_date: payload.due_date || null,
        line_items: payload.line_items as unknown as never,
        subtotal: Number(t.subtotal.toFixed(2)),
        discount_percent: payload.discount_percent,
        tax_percent: payload.tax_percent,
        total: Number(t.total.toFixed(2)),
        amount_paid: payload.amount_paid,
        balance: Number(t.balance.toFixed(2)),
        status: payload.status,
        notes: payload.notes || null,
      };
      if (payload.id) {
        const { error } = await supabase.from("invoices").update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert({ ...row, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setOpen(false);
      toast.success(editing ? "Invoice updated" : "Invoice created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      const matches =
        !q ||
        [i.invoice_number, i.client_name, i.client_email, i.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      return matches && (statusFilter === "ALL" || i.status === statusFilter);
    });
  }, [invoices, search, statusFilter]);

  const kpis = useMemo(() => {
    const billed = invoices.filter((i) => i.status !== "VOID");
    return {
      count: invoices.length,
      billed: billed.reduce((s, i) => s + Number(i.total), 0),
      paid: billed.reduce((s, i) => s + Number(i.amount_paid), 0),
      outstanding: billed.reduce((s, i) => s + Number(i.balance), 0),
    };
  }, [invoices]);

  // Invoices are ONLY created here, by explicit user action. Nothing auto-generates one.
  const openNew = () => {
    setEditing(null);
    setForm({
      invoice_number: nextInvoiceNumber(invoices.map((i) => i.invoice_number)),
      client_id: "NONE",
      client_name: "",
      client_email: "",
      client_address: "",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      line_items: [{ ...blankItem }],
      discount_percent: 0,
      tax_percent: 0,
      amount_paid: 0,
      status: "DRAFT",
      notes: "",
    });
    setOpen(true);
  };

  const openEdit = (inv: Invoice) => {
    setEditing(inv);
    setForm({
      invoice_number: inv.invoice_number,
      client_id: inv.client_id ?? "NONE",
      client_name: inv.client_name,
      client_email: inv.client_email ?? "",
      client_address: inv.client_address ?? "",
      issue_date: inv.issue_date,
      due_date: inv.due_date ?? "",
      line_items: inv.line_items.length ? inv.line_items : [{ ...blankItem }],
      discount_percent: Number(inv.discount_percent),
      tax_percent: Number(inv.tax_percent),
      amount_paid: Number(inv.amount_paid),
      status: inv.status as InvoiceStatus,
      notes: inv.notes ?? "",
    });
    setOpen(true);
  };

  const setItem = (index: number, patch: Partial<LineItem>) => {
    if (!form) return;
    const items = form.line_items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    setForm({ ...form, line_items: items });
  };

  return (
    <AppShell
      title="Invoices"
      subtitle="Invoices are never generated automatically — every one is created here, by you."
      actions={
        <Button onClick={openNew} className="rounded-full bg-ink px-5 text-ink-foreground hover:bg-ink/90">
          <Plus className="mr-1 size-4" /> Create Invoice
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Invoices" value={kpis.count} tone="ink" />
        <KpiCard label="Total Billed" value={money(kpis.billed)} />
        <KpiCard label="Collected" value={money(kpis.paid)} tone="gold" />
        <KpiCard label="Outstanding" value={money(kpis.outstanding)} />
      </div>

      <div className="panel mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number or client…"
            className="rounded-full pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TableShell className="mt-4">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <th className="px-4 py-4 text-left">Invoice #</th>
              <th className="px-4 py-4 text-left">Client</th>
              <th className="px-4 py-4 text-left">Issued</th>
              <th className="px-4 py-4 text-left">Due</th>
              <th className="px-4 py-4 text-right">Total</th>
              <th className="px-4 py-4 text-right">Balance</th>
              <th className="px-4 py-4 text-left">Status</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className="border-t border-border transition-colors hover:bg-secondary/60">
                <td className="whitespace-nowrap px-4 py-4 font-medium">{i.invoice_number}</td>
                <td className="px-4 py-4">
                  {i.client_name}
                  {i.client_email ? <span className="block text-xs text-muted-foreground">{i.client_email}</span> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(i.issue_date)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(i.due_date)}</td>
                <td className="px-4 py-4 text-right font-medium">{money(Number(i.total))}</td>
                <td className="px-4 py-4 text-right text-muted-foreground">{money(Number(i.balance))}</td>
                <td className="px-4 py-4">
                  <StatusPill status={i.status} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Preview" onClick={() => setPreview(i)}>
                      <Printer className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Edit invoice" onClick={() => openEdit(i)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete invoice"
                      onClick={() => {
                        if (confirm(`Delete ${i.invoice_number}?`)) remove.mutate(i.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && visible.length === 0 ? (
          <EmptyState
            title="No invoices"
            hint="Nothing is billed until you create an invoice yourself."
            action={
              <Button onClick={openNew} className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                <Plus className="mr-1 size-4" /> Create Invoice
              </Button>
            }
          />
        ) : null}
      </TableShell>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
            <DialogDescription>Pick a client to autofill billing details. Totals update live.</DialogDescription>
          </DialogHeader>
          {form && totals ? (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <F label="Invoice Number">
                  <Input
                    value={form.invoice_number}
                    onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  />
                </F>
                <F label="Client">
                  <Select
                    value={form.client_id}
                    onValueChange={(v) => {
                      const c = clients.find((x) => x.id === v);
                      setForm({
                        ...form,
                        client_id: v,
                        client_name: c?.name ?? form.client_name,
                        client_email: c?.email ?? form.client_email,
                        client_address: c?.address ?? form.client_address,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Manual entry</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
                <F label="Bill To">
                  <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                </F>
                <F label="Client Email">
                  <Input
                    value={form.client_email}
                    onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                  />
                </F>
                <F label="Issue Date">
                  <Input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                  />
                </F>
                <F label="Due Date">
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </F>
              </div>

              <div className="panel p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Line items
                </p>
                <div className="grid gap-2">
                  {form.line_items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 items-center gap-2">
                      <Input
                        className="col-span-6"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                      />
                      <Input
                        className="col-span-2"
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })}
                      />
                      <Input
                        className="col-span-3"
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => setItem(idx, { rate: Number(e.target.value) })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="col-span-1"
                        aria-label="Remove line"
                        onClick={() =>
                          setForm({ ...form, line_items: form.line_items.filter((_, i) => i !== idx) })
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="mt-3 rounded-full"
                  onClick={() => setForm({ ...form, line_items: [...form.line_items, { ...blankItem }] })}
                >
                  <Plus className="mr-1 size-4" /> Add line
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-4">
                  <F label="Discount %">
                    <Input
                      type="number"
                      min={0}
                      value={form.discount_percent}
                      onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
                    />
                  </F>
                  <F label="Tax %">
                    <Input
                      type="number"
                      min={0}
                      value={form.tax_percent}
                      onChange={(e) => setForm({ ...form, tax_percent: Number(e.target.value) })}
                    />
                  </F>
                  <F label="Amount Paid">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amount_paid}
                      onChange={(e) => setForm({ ...form, amount_paid: Number(e.target.value) })}
                    />
                  </F>
                  <F label="Status">
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as InvoiceStatus })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVOICE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </F>
                </div>
                <div className="ink-panel h-fit p-5 text-sm">
                  <Row label="Subtotal" value={money(totals.subtotal)} />
                  <Row label={`Discount (${form.discount_percent}%)`} value={`- ${money(totals.discount)}`} />
                  <Row label={`Tax (${form.tax_percent}%)`} value={money(totals.tax)} />
                  <div className="my-3 h-px bg-gold/25" />
                  <Row label="Total" value={money(totals.total)} strong />
                  <Row label="Paid" value={money(form.amount_paid)} />
                  <Row label="Balance Due" value={money(totals.balance)} strong />
                </div>
              </div>

              <F label="Notes / Payment Terms">
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </F>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
              disabled={!form?.client_name.trim() || save.isPending}
              onClick={() => form && save.mutate({ ...form, ...(editing ? { id: editing.id } : {}) })}
            >
              {editing ? "Save invoice" : "Create invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Invoice Preview</DialogTitle>
            <DialogDescription>Print or save as PDF. Email sending can be added later.</DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="panel p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-xl font-semibold">NUMO MARKETING</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Invoice</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">{preview.invoice_number}</p>
                  <p className="text-muted-foreground">Issued {formatDate(preview.issue_date)}</p>
                  <p className="text-muted-foreground">Due {formatDate(preview.due_date)}</p>
                </div>
              </div>
              <div className="mt-6 text-sm">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Bill to</p>
                <p className="font-medium">{preview.client_name}</p>
                {preview.client_email ? <p className="text-muted-foreground">{preview.client_email}</p> : null}
                {preview.client_address ? <p className="text-muted-foreground">{preview.client_address}</p> : null}
              </div>
              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.line_items.map((it, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-2">{it.description}</td>
                      <td className="py-2 text-right">{it.quantity}</td>
                      <td className="py-2 text-right">{money(Number(it.rate))}</td>
                      <td className="py-2 text-right">{money(Number(it.quantity) * Number(it.rate))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 ml-auto w-full max-w-xs text-sm">
                <Row label="Subtotal" value={money(Number(preview.subtotal))} light />
                <Row label="Discount" value={`${preview.discount_percent}%`} light />
                <Row label="Tax" value={`${preview.tax_percent}%`} light />
                <Row label="Total" value={money(Number(preview.total))} strong light />
                <Row label="Balance Due" value={money(Number(preview.balance))} strong light />
              </div>
              {preview.notes ? <p className="mt-6 text-sm text-muted-foreground">{preview.notes}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" disabled title="Email sending coming soon">
              <Mail className="mr-1 size-4" /> Email invoice
            </Button>
            <Button
              className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
              onClick={() => window.print()}
            >
              <Printer className="mr-1 size-4" /> Print / Save PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value, strong, light }: { label: string; value: string; strong?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={light ? "text-muted-foreground" : "text-ink-muted"}>{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
