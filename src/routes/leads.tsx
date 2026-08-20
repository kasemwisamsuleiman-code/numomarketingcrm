import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  ArrowUpDown,
  AlertTriangle,
  Download,
  Upload,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { StatusPill } from "@/components/crm/StatusPill";
import { LEAD_STATUSES, formatDate, normalizeKey, normalizePhone, type LeadStatus } from "@/lib/crm";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";

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

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Lead Tracker — Numo CRM" },
      {
        name: "description",
        content: "Track agency prospects with outreach status, contact details, personalized lines and notes.",
      },
      { property: "og:title", content: "Lead Tracker — Numo CRM" },
      { property: "og:description", content: "Search, filter and manage every outreach lead in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <LeadsPage />
    </RequireAuth>
  ),
});

type Lead = {
  id: string;
  date_added: string;
  business_name: string;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  business_hours: string | null;
  personalized_line: string | null;
  lead_score: number | null;
  source: string | null;
  outreach_channel: string | null;
  status: string;
  notes: string | null;
};

const emptyLead = {
  date_added: new Date().toISOString().slice(0, 10),
  business_name: "",
  category: "",
  location: "",
  phone: "",
  email: "",
  website: "",
  business_hours: "",
  personalized_line: "",
  status: "READY" as LeadStatus,
  notes: "",
};

type LeadForm = typeof emptyLead;
type SortKey = "date_added" | "business_name" | "status" | "location" | "lead_score";

function LeadsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date_added");
  const [sortAsc, setSortAsc] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyLead);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("date_added", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: LeadForm & { id?: string }) => {
      const row = {
        ...payload,
        category: payload.category || null,
        location: payload.location || null,
        phone: payload.phone || null,
        email: payload.email || null,
        website: payload.website || null,
        business_hours: payload.business_hours || null,
        personalized_line: payload.personalized_line || null,
        notes: payload.notes || null,
      };
      if (payload.id) {
        const { id: _id, ...rest } = row;
        const { error } = await supabase.from("leads").update(rest).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert({ ...row, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setOpen(false);
      toast.success(editing ? "Lead updated" : "Lead added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead deleted");
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const importLeads = useMutation({
    mutationFn: async (text: string) => {
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("No rows found in that CSV.");
      const existing = new Set(leads.map((l) => normalizeKey(l.business_name)));
      const payload: Record<string, unknown>[] = [];
      let skipped = 0;
      for (const r of rows) {
        const name = r["business_name"] || r["business"] || r["name"] || "";
        if (!name) {
          skipped++;
          continue;
        }
        if (existing.has(normalizeKey(name))) {
          skipped++;
          continue;
        }
        existing.add(normalizeKey(name));
        const status = (r["status"] || r["outreach_status"] || "READY").toUpperCase();
        payload.push({
          user_id: user!.id,
          business_name: name,
          date_added: /^\d{4}-\d{2}-\d{2}$/.test(r["date_added"] ?? "")
            ? r["date_added"]
            : new Date().toISOString().slice(0, 10),
          category: r["category"] || null,
          location: r["location"] || null,
          phone: r["phone"] || null,
          email: r["email"] || null,
          website: r["website"] || null,
          business_hours: r["business_hours"] || r["hours"] || null,
          personalized_line: r["personalized_line"] || null,
          status: (LEAD_STATUSES as readonly string[]).includes(status) ? status : "READY",
          notes: r["notes"] || null,
        });
      }
      if (payload.length === 0) throw new Error("Nothing new to import — all rows were duplicates or unnamed.");
      const { error } = await supabase.from("leads").insert(payload as never);
      if (error) throw error;
      return { imported: payload.length, skipped };
    },
    onSuccess: ({ imported, skipped }) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Imported ${imported} lead${imported === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async (lead: Lead) => {
      const { error: cErr } = await supabase.from("clients").insert({
        user_id: user!.id,
        name: lead.business_name,
        email: lead.email,
        phone: lead.phone,
        company: lead.business_name,
        address: lead.location,
        status: "ONBOARDING",
        notes: lead.notes,
      });
      if (cErr) throw cErr;
      const { error: lErr } = await supabase.from("leads").update({ status: "CLIENT" }).eq("id", lead.id);
      if (lErr) throw lErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Lead converted to client");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const columns = [
      "date_added",
      "business_name",
      "category",
      "location",
      "phone",
      "email",
      "website",
      "business_hours",
      "personalized_line",
      "lead_score",
      "outreach_channel",
      "source",
      "status",
      "notes",
    ];
    downloadCsv(`numo-leads-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(visible, columns));
  };



  const categories = useMemo(
    () => Array.from(new Set(leads.map((l) => l.category).filter(Boolean) as string[])).sort(),
    [leads],
  );

  const duplicateIds = useMemo(() => {
    const seen = new Map<string, string>();
    const dupes = new Set<string>();
    for (const l of leads) {
      const keys = [
        `n:${normalizeKey(l.business_name)}|${normalizeKey(l.location)}`,
        l.email ? `e:${normalizeKey(l.email)}` : "",
        normalizePhone(l.phone).length >= 7 ? `p:${normalizePhone(l.phone)}` : "",
      ].filter(Boolean);
      for (const k of keys) {
        const prev = seen.get(k);
        if (prev) {
          dupes.add(prev);
          dupes.add(l.id);
        } else {
          seen.set(k, l.id);
        }
      }
    }
    return dupes;
  }, [leads]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = leads.filter((l) => {
      const matchesSearch =
        !q ||
        [l.business_name, l.category, l.location, l.phone, l.email, l.website, l.personalized_line, l.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = statusFilter === "ALL" || l.status === statusFilter;
      const matchesCat = categoryFilter === "ALL" || l.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCat;
    });
    return rows.sort((a, b) => {
      if (sortKey === "lead_score") {
        return ((a.lead_score ?? -1) - (b.lead_score ?? -1)) * (sortAsc ? 1 : -1);
      }
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortAsc ? 1 : -1);
    });
  }, [leads, search, statusFilter, categoryFilter, sortKey, sortAsc]);

  const kpis = useMemo(() => {
    const count = (s: string) => leads.filter((l) => l.status === s).length;
    const contacted = count("CONTACTED") + count("REPLIED") + count("MEETING SET") + count("CLIENT");
    return {
      total: leads.length,
      ready: count("READY"),
      contacted,
      replied: count("REPLIED"),
      meetings: count("MEETING SET"),
      clients: count("CLIENT"),
      replyRate: contacted ? Math.round(((count("REPLIED") + count("MEETING SET") + count("CLIENT")) / contacted) * 100) : 0,
    };
  }, [leads]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyLead);
    setOpen(true);
  };
  const openEdit = (lead: Lead) => {
    setEditing(lead);
    setForm({
      date_added: lead.date_added,
      business_name: lead.business_name,
      category: lead.category ?? "",
      location: lead.location ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      website: lead.website ?? "",
      business_hours: lead.business_hours ?? "",
      personalized_line: lead.personalized_line ?? "",
      status: lead.status as LeadStatus,
      notes: lead.notes ?? "",
    });
    setOpen(true);
  };

  const potentialDuplicate = useMemo(() => {
    if (!form.business_name.trim()) return null;
    return (
      leads.find(
        (l) =>
          l.id !== editing?.id &&
          (normalizeKey(l.business_name) === normalizeKey(form.business_name) ||
            (!!form.email && normalizeKey(l.email) === normalizeKey(form.email)) ||
            (normalizePhone(form.phone).length >= 7 && normalizePhone(l.phone) === normalizePhone(form.phone))),
      ) ?? null
    );
  }, [leads, form.business_name, form.email, form.phone, editing]);

  const sortBtn = (key: SortKey, label: string) => (
    <button
      className="inline-flex items-center gap-1 uppercase"
      onClick={() => {
        if (sortKey === key) setSortAsc((v) => !v);
        else {
          setSortKey(key);
          setSortAsc(true);
        }
      }}
    >
      {label} <ArrowUpDown className="size-3 opacity-60" />
    </button>
  );

  return (
    <AppShell
      title="Lead Tracker"
      subtitle="Every prospect, outreach status and personalized line — searchable, sortable and duplicate-aware."
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              importLeads.mutate(await file.text());
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importLeads.isPending}
            className="rounded-full border-gold/40 px-5"
          >
            <Upload className="mr-1 size-4" /> Import CSV
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={visible.length === 0}
            className="rounded-full border-gold/40 px-5"
          >
            <Download className="mr-1 size-4" /> Export CSV
          </Button>
          <Button onClick={openNew} className="rounded-full bg-ink px-5 text-ink-foreground hover:bg-ink/90">
            <Plus className="mr-1 size-4" /> Add Lead
          </Button>
        </>
      }

    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Leads" value={kpis.total} tone="ink" hint={`${kpis.ready} ready for outreach`} />
        <KpiCard label="Contacted" value={kpis.contacted} hint={`${kpis.replied} replied`} />
        <KpiCard label="Meetings Set" value={kpis.meetings} tone="gold" />
        <KpiCard label="Reply Rate" value={`${kpis.replyRate}%`} hint={`${kpis.clients} converted to clients`} />
      </div>

      <div className="panel mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business, contact, notes…"
            className="rounded-full pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-52">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TableShell className="mt-4">
        <table className="w-full min-w-[1650px] border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-[11px] font-semibold tracking-[0.12em] text-ink-muted">
              <th className="px-4 py-4 text-left">{sortBtn("date_added", "Date Added")}</th>
              <th className="px-4 py-4 text-left">{sortBtn("business_name", "Business")}</th>
              <th className="px-4 py-4 text-left uppercase">Category</th>
              <th className="px-4 py-4 text-left">{sortBtn("location", "Location")}</th>
              <th className="px-4 py-4 text-left uppercase">Phone</th>
              <th className="px-4 py-4 text-left uppercase">Email</th>
              <th className="px-4 py-4 text-left uppercase">Website</th>
              <th className="px-4 py-4 text-left uppercase">Hours</th>
              <th className="px-4 py-4 text-left uppercase">Personalized Line</th>
              <th className="px-4 py-4 text-left">{sortBtn("lead_score", "Score")}</th>
              <th className="px-4 py-4 text-left uppercase">Channel</th>
              <th className="px-4 py-4 text-left uppercase">Source</th>
              <th className="px-4 py-4 text-left">{sortBtn("status", "Status")}</th>
              <th className="px-4 py-4 text-left uppercase">Notes</th>
              <th className="px-4 py-4 text-right uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => (
              <tr key={l.id} className="border-t border-border transition-colors hover:bg-secondary/60">
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(l.date_added)}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2 font-medium">
                    {l.business_name}
                    {duplicateIds.has(l.id) ? (
                      <span title="Possible duplicate" className="text-warning">
                        <AlertTriangle className="size-4" />
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-muted-foreground">{l.category || "—"}</td>
                <td className="px-4 py-4 text-muted-foreground">{l.location || "—"}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{l.phone || "—"}</td>
                <td className="px-4 py-4 text-muted-foreground">{l.email || "—"}</td>
                <td className="max-w-[180px] truncate px-4 py-4 text-muted-foreground">{l.website || "—"}</td>
                <td className="max-w-[160px] truncate px-4 py-4 text-muted-foreground">{l.business_hours || "—"}</td>
                <td className="max-w-[260px] truncate px-4 py-4 text-muted-foreground">{l.personalized_line || "—"}</td>
                <td className="px-4 py-4">
                  {typeof l.lead_score === "number" ? (
                    <span className="inline-flex min-w-10 items-center justify-center rounded-full border border-gold/40 bg-gold-soft px-2 py-1 text-xs font-semibold text-gold-foreground">
                      {l.lead_score}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{l.outreach_channel || "—"}</td>
                <td className="whitespace-nowrap px-4 py-4 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {l.source || "MANUAL"}
                </td>
                <td className="px-4 py-4">
                  <StatusPill status={l.status} />
                </td>
                <td className="max-w-[220px] truncate px-4 py-4 text-muted-foreground">{l.notes || "—"}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Convert lead to client"
                      title="Convert to client"
                      disabled={convert.isPending}
                      onClick={() => {
                        if (confirm(`Convert ${l.business_name} into a client?`)) convert.mutate(l);
                      }}
                    >
                      <UserPlus className="size-4" />
                    </Button>

                    <Button variant="ghost" size="icon" onClick={() => openEdit(l)} aria-label="Edit lead">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete lead"
                      onClick={() => {
                        if (confirm(`Delete ${l.business_name}?`)) remove.mutate(l.id);
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
            title="No leads yet"
            hint="Add your first prospect manually — automated lead generation can plug into this same table later."
            action={
              <Button onClick={openNew} className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                <Plus className="mr-1 size-4" /> Add Lead
              </Button>
            }
          />
        ) : null}
      </TableShell>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editing ? "Edit Lead" : "Add Lead"}</DialogTitle>
            <DialogDescription>All fields except business name are optional.</DialogDescription>
          </DialogHeader>

          {potentialDuplicate ? (
            <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-gold-foreground">
              <AlertTriangle className="mt-0.5 size-4" />
              <span>
                Possible duplicate of <strong>{potentialDuplicate.business_name}</strong> ({potentialDuplicate.status}).
              </span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date Added">
              <Input
                type="date"
                value={form.date_added}
                onChange={(e) => setForm({ ...form, date_added: e.target.value })}
              />
            </Field>
            <Field label="Business Name">
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
            </Field>
            <Field label="Category">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Website">
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
            <Field label="Business Hours">
              <Input
                value={form.business_hours}
                onChange={(e) => setForm({ ...form, business_hours: e.target.value })}
              />
            </Field>
            <Field label="Outreach Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Personalized Line">
                <Textarea
                  rows={2}
                  value={form.personalized_line}
                  onChange={(e) => setForm({ ...form, personalized_line: e.target.value })}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
              disabled={!form.business_name.trim() || save.isPending}
              onClick={() => save.mutate({ ...form, ...(editing ? { id: editing.id } : {}) })}
            >
              {editing ? "Save changes" : "Add lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
