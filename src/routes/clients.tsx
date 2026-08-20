import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { StatusPill } from "@/components/crm/StatusPill";
import { CLIENT_STATUSES, formatDate, type ClientStatus } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Numo CRM" },
      { name: "description", content: "Manage Numo Marketing retainer clients, contacts and account status." },
      { property: "og:title", content: "Clients — Numo CRM" },
      { property: "og:description", content: "Your active agency accounts, contacts and notes in one polished view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ClientsPage />
    </RequireAuth>
  ),
});

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const emptyClient = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  status: "ACTIVE" as ClientStatus,
  notes: "",
};
type ClientForm = typeof emptyClient;

function ClientsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyClient);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: ClientForm & { id?: string }) => {
      const row = {
        name: payload.name,
        contact_name: payload.contact_name || null,
        email: payload.email || null,
        phone: payload.phone || null,
        company: payload.company || null,
        address: payload.address || null,
        status: payload.status,
        notes: payload.notes || null,
      };
      if (payload.id) {
        const { error } = await supabase.from("clients").update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert({ ...row, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      toast.success(editing ? "Client updated" : "Client added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client removed");
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const matches =
        !q ||
        [c.name, c.contact_name, c.email, c.phone, c.company, c.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      return matches && (statusFilter === "ALL" || c.status === statusFilter);
    });
  }, [clients, search, statusFilter]);

  const kpis = useMemo(
    () => ({
      total: clients.length,
      active: clients.filter((c) => c.status === "ACTIVE").length,
      onboarding: clients.filter((c) => c.status === "ONBOARDING").length,
      churned: clients.filter((c) => c.status === "CHURNED").length,
    }),
    [clients],
  );

  const openNew = () => {
    setEditing(null);
    setForm(emptyClient);
    setOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      contact_name: c.contact_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      company: c.company ?? "",
      address: c.address ?? "",
      status: c.status as ClientStatus,
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <AppShell
      title="Clients"
      subtitle="Signed accounts, primary contacts and billing details that feed straight into invoicing."
      actions={
        <Button onClick={openNew} className="rounded-full bg-ink px-5 text-ink-foreground hover:bg-ink/90">
          <Plus className="mr-1 size-4" /> Add Client
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Clients" value={kpis.total} tone="ink" />
        <KpiCard label="Active" value={kpis.active} tone="gold" />
        <KpiCard label="Onboarding" value={kpis.onboarding} />
        <KpiCard label="Churned" value={kpis.churned} />
      </div>

      <div className="panel mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients, contacts, notes…"
            className="rounded-full pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {CLIENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TableShell className="mt-4">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <th className="px-4 py-4 text-left">Client</th>
              <th className="px-4 py-4 text-left">Contact</th>
              <th className="px-4 py-4 text-left">Email</th>
              <th className="px-4 py-4 text-left">Phone</th>
              <th className="px-4 py-4 text-left">Since</th>
              <th className="px-4 py-4 text-left">Status</th>
              <th className="px-4 py-4 text-left">Notes</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className="border-t border-border transition-colors hover:bg-secondary/60">
                <td className="px-4 py-4">
                  <p className="font-medium">{c.name}</p>
                  {c.company ? <p className="text-xs text-muted-foreground">{c.company}</p> : null}
                </td>
                <td className="px-4 py-4 text-muted-foreground">{c.contact_name || "—"}</td>
                <td className="px-4 py-4 text-muted-foreground">{c.email || "—"}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{c.phone || "—"}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(c.created_at)}</td>
                <td className="px-4 py-4">
                  <StatusPill status={c.status} />
                </td>
                <td className="max-w-[240px] truncate px-4 py-4 text-muted-foreground">{c.notes || "—"}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Edit client">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete client"
                      onClick={() => {
                        if (confirm(`Remove ${c.name}?`)) remove.mutate(c.id);
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
          <EmptyState title="No clients yet" hint="Convert a lead or add a client manually to start invoicing." />
        ) : null}
      </TableShell>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing ? "Edit Client" : "Add Client"}</DialogTitle>
            <DialogDescription>Client details autofill new invoices.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Client Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </F>
            <F label="Company">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </F>
            <F label="Contact Name">
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </F>
            <F label="Email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </F>
            <F label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </F>
            <F label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ClientStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <div className="sm:col-span-2">
              <F label="Billing Address">
                <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </F>
            </div>
            <div className="sm:col-span-2">
              <F label="Notes">
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </F>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate({ ...form, ...(editing ? { id: editing.id } : {}) })}
            >
              {editing ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
