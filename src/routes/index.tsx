import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Target, Mail, Phone, Send, MessageSquare, CalendarCheck, Users, FileText, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { StatusPill } from "@/components/crm/StatusPill";
import { DAILY_TARGET, formatDate, formatDateTime, money } from "@/lib/crm";
import { generateLeads } from "@/lib/leadgen.functions";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Numo Marketing CRM" },
      {
        name: "description",
        content: "Live pipeline metrics for Numo Marketing: leads, contact data coverage, replies and meetings set.",
      },
      { property: "og:title", content: "Dashboard — Numo Marketing CRM" },
      { property: "og:description", content: "Track leads, replies, meetings and revenue in one premium agency workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  ),
});

type LeadRow = {
  id: string;
  business_name: string;
  category: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  date_added: string;
  created_at: string;
  lead_score: number | null;
  source: string | null;
  outreach_channel: string | null;
};

function DashboardPage() {
  const qc = useQueryClient();
  const runGeneration = useServerFn(generateLeads);
  const [genCategory, setGenCategory] = useState("Barbershop");
  const [genLocation, setGenLocation] = useState("");

  const quickRun = useMutation({
    mutationFn: async () =>
      runGeneration({ data: { category: genCategory.trim(), location: genLocation.trim(), count: 10 } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_gen_runs"] });
      toast.success(`${res.created} leads added`, {
        description: `${res.duplicates} duplicates skipped · ${res.rejected} filtered out`,
      });
    },
    onError: (err: Error) => toast.error("Lead generation failed", { description: err.message }),
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeadRow[];
    },
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const kpis = useMemo(() => {
    const total = leads.length;
    const emails = leads.filter((l) => (l.email ?? "").trim().length > 0).length;
    const phones = leads.filter((l) => (l.phone ?? "").trim().length > 0).length;
    const ready = leads.filter((l) => l.status === "READY").length;
    const replies = leads.filter((l) => l.status === "REPLIED").length;
    const meetingsSet = leads.filter((l) => l.status === "MEETING SET").length;
    const contacted = leads.filter((l) => ["CONTACTED", "REPLIED", "MEETING SET", "CLIENT"].includes(l.status)).length;
    const won = leads.filter((l) => l.status === "CLIENT").length;
    return { total, emails, phones, ready, replies, meetingsSet, contacted, won };
  }, [leads]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (meetings as Array<Record<string, unknown>>)
      .filter((m) => new Date(String(m['scheduled_at'])).getTime() >= now && m['status'] !== "CANCELLED")
      .slice(0, 5);
  }, [meetings]);

  const outstanding = useMemo(
    () =>
      (invoices as Array<Record<string, unknown>>)
        .filter((i) => i['status'] !== "PAID" && i['status'] !== "VOID")
        .reduce((sum, i) => sum + Number(i['balance'] ?? 0), 0),
    [invoices],
  );

  const generatedLeads = useMemo(() => leads.filter((l) => (l.source ?? "MANUAL") !== "MANUAL"), [leads]);
  const generatedToday = useMemo(() => {
    const today = new Date().toDateString();
    return generatedLeads.filter((l) => new Date(l.created_at).toDateString() === today).length;
  }, [generatedLeads]);
  const targetProgress = Math.min(100, Math.round((generatedToday / DAILY_TARGET) * 100));

  const recentLeads = leads.slice(0, 6);

  return (
    <AppShell
      title="Dashboard"
      subtitle="Live snapshot of your outreach pipeline, meetings and billing."
      actions={
        <>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/leads">Open Lead Tracker</Link>
          </Button>
          <Button asChild className="rounded-full bg-gold text-gold-foreground hover:bg-gold/90">
            <Link to="/generator">Generate leads</Link>
          </Button>
          <Button asChild className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
            <Link to="/invoices">Invoices</Link>
          </Button>
        </>
      }
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="ink-panel p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-gold">
            <Sparkles className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Lead generation</span>
          </div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink-foreground">Get new leads on command</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Choose a business type and location — Numo sources local businesses, filters out chains, scores each lead and
            writes a human opening line straight into your Lead Tracker.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Input
              className="rounded-full border-white/15 bg-white/10 text-ink-foreground placeholder:text-ink-muted"
              placeholder="Business type"
              value={genCategory}
              onChange={(e) => setGenCategory(e.target.value)}
              aria-label="Business type"
            />
            <Input
              className="rounded-full border-white/15 bg-white/10 text-ink-foreground placeholder:text-ink-muted"
              placeholder="Location (city)"
              value={genLocation}
              onChange={(e) => setGenLocation(e.target.value)}
              aria-label="Location"
            />
            <Button
              className="rounded-full bg-gold text-gold-foreground hover:bg-gold/90"
              disabled={quickRun.isPending || !genLocation.trim() || !genCategory.trim()}
              onClick={() => quickRun.mutate()}
            >
              {quickRun.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 size-4" /> Generate 10
                </>
              )}
            </Button>
          </div>
          <Link
            to="/generator"
            className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.16em] text-gold hover:underline"
          >
            Advanced lead generator →
          </Link>
        </div>

        <div className="panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Daily target</p>
          <p className="mt-2 font-display text-4xl font-semibold">
            {generatedToday}
            <span className="text-base text-muted-foreground"> / {DAILY_TARGET}</span>
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${targetProgress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{targetProgress}% of today's 50-lead goal</p>
          <p className="mt-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{generatedLeads.length}</span> leads generated in total
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Total leads" value={kpis.total} icon={Target} tone="ink" hint={`${kpis.contacted} contacted`} />
        <KpiCard label="Emails found" value={kpis.emails} icon={Mail} hint={pct(kpis.emails, kpis.total)} />
        <KpiCard label="Phones found" value={kpis.phones} icon={Phone} hint={pct(kpis.phones, kpis.total)} />
        <KpiCard label="Ready to contact" value={kpis.ready} icon={Send} tone="gold" />
        <KpiCard label="Replies" value={kpis.replies} icon={MessageSquare} hint={`${kpis.won} converted to clients`} />
        <KpiCard label="Meetings set" value={kpis.meetingsSet} icon={CalendarCheck} hint={`${upcoming.length} upcoming`} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Active clients" value={clients.length} icon={Users} />
        <KpiCard label="Invoices" value={invoices.length} icon={FileText} />
        <KpiCard label="Outstanding balance" value={money(outstanding)} icon={FileText} />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent leads</h2>
            <Link to="/leads" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <TableShell>
            {leadsLoading ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading leads…</div>
            ) : recentLeads.length === 0 ? (
              <EmptyState
                title="No leads yet"
                hint="Add your first prospect in the Lead Tracker to start filling this dashboard."
                action={
                  <Button asChild className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                    <Link to="/leads">Add a lead</Link>
                  </Button>
                }
              />
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-ink text-ink-foreground">
                  <tr>
                    <Th>Business</Th>
                    <Th>Category</Th>
                    <Th>Location</Th>
                    <Th>Added</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeads.map((lead) => (
                    <tr key={lead.id} className="border-t border-border/70">
                      <td className="px-4 py-3 font-medium">{lead.business_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.category || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.location || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(lead.date_added)}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={lead.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableShell>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Upcoming meetings</h2>
            <Link to="/meetings" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <div className="panel p-2">
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing scheduled" hint="Book a discovery call from the Meetings page." />
            ) : (
              <ul className="divide-y divide-border/70">
                {upcoming.map((m) => (
                  <li key={String(m['id'])} className="px-3 py-3">
                    <p className="text-sm font-medium">{String(m['title'])}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(String(m['scheduled_at']))}</p>
                    <div className="mt-2">
                      <StatusPill status={String(m['status'])} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recently generated leads</h2>
          <Link to="/generator" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
            Lead generator
          </Link>
        </div>
        <TableShell>
          {generatedLeads.length === 0 ? (
            <EmptyState
              title="No generated leads yet"
              hint="Run the lead generator to pull in scored, personalized local businesses."
              action={
                <Button asChild className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
                  <Link to="/generator">Open Lead Generator</Link>
                </Button>
              }
            />
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-ink text-ink-foreground">
                <tr>
                  <Th>Business</Th>
                  <Th>Category</Th>
                  <Th>Score</Th>
                  <Th>Channel</Th>
                  <Th>Opening line</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {generatedLeads.slice(0, 6).map((lead) => (
                  <tr key={lead.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">{lead.business_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.category || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex min-w-10 items-center justify-center rounded-full border border-gold/40 bg-gold-soft px-2 py-1 text-xs font-semibold text-gold-foreground">
                        {lead.lead_score ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.outreach_channel || "—"}</td>
                    <td className="max-w-[340px] truncate px-4 py-3 text-muted-foreground">
                      {(lead as { personalized_line?: string | null }).personalized_line || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={lead.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </section>
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em]">{children}</th>;
}

function pct(part: number, total: number) {
  if (!total) return "0% coverage";
  return `${Math.round((part / total) * 100)}% coverage`;
}
