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
import { MEETING_STATUSES, formatDateTime, toLocalInputValue, type MeetingStatus } from "@/lib/crm";
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

export const Route = createFileRoute("/meetings")({
  head: () => ({
    meta: [
      { title: "Meetings — Numo CRM" },
      { name: "description", content: "Schedule and track discovery calls, pitches and client check-ins for Numo Marketing." },
      { property: "og:title", content: "Meetings — Numo CRM" },
      { property: "og:description", content: "Every booked call with status, attendee and notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <MeetingsPage />
    </RequireAuth>
  ),
});

type Meeting = {
  id: string;
  title: string;
  lead_id: string | null;
  client_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  notes: string | null;
};

const emptyMeeting = {
  title: "",
  lead_id: "NONE",
  client_id: "NONE",
  contact_name: "",
  contact_email: "",
  scheduled_at: toLocalInputValue(null),
  duration_minutes: 30,
  location: "",
  status: "SCHEDULED" as MeetingStatus,
  notes: "",
};
type MeetingForm = typeof emptyMeeting;

function MeetingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<MeetingForm>(emptyMeeting);

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meetings").select("*").order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as Meeting[];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, business_name").order("business_name");
      if (error) throw error;
      return data as { id: string; business_name: string }[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, email").order("name");
      if (error) throw error;
      return data as { id: string; name: string; email: string | null }[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: MeetingForm & { id?: string }) => {
      const row = {
        title: payload.title,
        lead_id: payload.lead_id === "NONE" ? null : payload.lead_id,
        client_id: payload.client_id === "NONE" ? null : payload.client_id,
        contact_name: payload.contact_name || null,
        contact_email: payload.contact_email || null,
        scheduled_at: new Date(payload.scheduled_at).toISOString(),
        duration_minutes: Number(payload.duration_minutes) || 30,
        location: payload.location || null,
        status: payload.status,
        notes: payload.notes || null,
      };
      if (payload.id) {
        const { error } = await supabase.from("meetings").update(row).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("meetings").insert({ ...row, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setOpen(false);
      toast.success(editing ? "Meeting updated" : "Meeting scheduled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting deleted");
    },
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      const matches =
        !q ||
        [m.title, m.contact_name, m.contact_email, m.location, m.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      return matches && (statusFilter === "ALL" || m.status === statusFilter);
    });
  }, [meetings, search, statusFilter]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 24 * 60 * 60 * 1000;
    return {
      total: meetings.length,
      upcoming: meetings.filter((m) => new Date(m.scheduled_at).getTime() >= now && m.status !== "CANCELLED").length,
      thisWeek: meetings.filter((m) => {
        const t = new Date(m.scheduled_at).getTime();
        return t >= now && t <= week;
      }).length,
      completed: meetings.filter((m) => m.status === "COMPLETED").length,
    };
  }, [meetings]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyMeeting, scheduled_at: toLocalInputValue(null) });
    setOpen(true);
  };
  const openEdit = (m: Meeting) => {
    setEditing(m);
    setForm({
      title: m.title,
      lead_id: m.lead_id ?? "NONE",
      client_id: m.client_id ?? "NONE",
      contact_name: m.contact_name ?? "",
      contact_email: m.contact_email ?? "",
      scheduled_at: toLocalInputValue(m.scheduled_at),
      duration_minutes: m.duration_minutes,
      location: m.location ?? "",
      status: m.status as MeetingStatus,
      notes: m.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <AppShell
      title="Meetings"
      subtitle="Discovery calls, pitches and check-ins linked to the leads and clients they belong to."
      actions={
        <Button onClick={openNew} className="rounded-full bg-ink px-5 text-ink-foreground hover:bg-ink/90">
          <Plus className="mr-1 size-4" /> Schedule Meeting
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Meetings" value={kpis.total} tone="ink" />
        <KpiCard label="Upcoming" value={kpis.upcoming} tone="gold" />
        <KpiCard label="Next 7 Days" value={kpis.thisWeek} />
        <KpiCard label="Completed" value={kpis.completed} />
      </div>

      <div className="panel mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings, contacts, notes…"
            className="rounded-full pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full rounded-full lg:w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {MEETING_STATUSES.map((s) => (
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
              <th className="px-4 py-4 text-left">When</th>
              <th className="px-4 py-4 text-left">Meeting</th>
              <th className="px-4 py-4 text-left">Contact</th>
              <th className="px-4 py-4 text-left">Duration</th>
              <th className="px-4 py-4 text-left">Location / Link</th>
              <th className="px-4 py-4 text-left">Status</th>
              <th className="px-4 py-4 text-left">Notes</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.id} className="border-t border-border transition-colors hover:bg-secondary/60">
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDateTime(m.scheduled_at)}</td>
                <td className="px-4 py-4 font-medium">{m.title}</td>
                <td className="px-4 py-4 text-muted-foreground">
                  {m.contact_name || "—"}
                  {m.contact_email ? <span className="block text-xs">{m.contact_email}</span> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{m.duration_minutes} min</td>
                <td className="max-w-[220px] truncate px-4 py-4 text-muted-foreground">{m.location || "—"}</td>
                <td className="px-4 py-4">
                  <StatusPill status={m.status} />
                </td>
                <td className="max-w-[220px] truncate px-4 py-4 text-muted-foreground">{m.notes || "—"}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)} aria-label="Edit meeting">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete meeting"
                      onClick={() => {
                        if (confirm(`Delete "${m.title}"?`)) remove.mutate(m.id);
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
          <EmptyState title="No meetings scheduled" hint="Book a call from a lead that replied to your outreach." />
        ) : null}
      </TableShell>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editing ? "Edit Meeting" : "Schedule Meeting"}
            </DialogTitle>
            <DialogDescription>Link the meeting to a lead or an existing client.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <F label="Title">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </F>
            </div>
            <F label="Date & Time">
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
            </F>
            <F label="Duration (minutes)">
              <Input
                type="number"
                min={5}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              />
            </F>
            <F label="Related Lead">
              <Select
                value={form.lead_id}
                onValueChange={(v) => {
                  const lead = leads.find((l) => l.id === v);
                  setForm({
                    ...form,
                    lead_id: v,
                    title: form.title || (lead ? `Discovery call — ${lead.business_name}` : form.title),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="Related Client">
              <Select
                value={form.client_id}
                onValueChange={(v) => {
                  const client = clients.find((c) => c.id === v);
                  setForm({
                    ...form,
                    client_id: v,
                    contact_email: form.contact_email || client?.email || "",
                    contact_name: form.contact_name || client?.name || "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="Contact Name">
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </F>
            <F label="Contact Email">
              <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </F>
            <F label="Location / Link">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </F>
            <F label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as MeetingStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
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
              disabled={!form.title.trim() || save.isPending}
              onClick={() => save.mutate({ ...form, ...(editing ? { id: editing.id } : {}) })}
            >
              {editing ? "Save changes" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
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
