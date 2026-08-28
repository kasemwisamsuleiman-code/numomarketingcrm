import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Target, MapPin, Layers, Loader2, CheckCircle2, Copy, Bot, Radar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { DAILY_TARGET, formatDateTime } from "@/lib/crm";
import { advanceLeadGeneration, generateLeads, getLeadGenStatus, type GeneratedLead } from "@/lib/leadgen.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/generator")({
  head: () => ({
    meta: [
      { title: "Lead Generator — Numo CRM" },
      {
        name: "description",
        content:
          "Generate qualified local business leads by category and location, scored and personalized, straight into the Numo Lead Tracker.",
      },
      { property: "og:title", content: "Lead Generator — Numo CRM" },
      {
        property: "og:description",
        content: "Run on-demand lead generation with AI qualification, scoring and personalized opening lines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <GeneratorPage />
    </RequireAuth>
  ),
});

const CATEGORY_PRESETS = [
  "Barbershop",
  "Hair Salon",
  "Dentist",
  "Plumber",
  "Electrician",
  "Landscaping",
  "Auto Repair",
  "Restaurant",
  "Café",
  "Gym / Personal Training",
  "Cleaning Service",
  "Roofing",
  "Real Estate Agent",
  "Med Spa",
];

type RunRow = {
  id: string;
  category: string;
  location: string;
  requested: number;
  created_count: number;
  skipped_duplicates: number;
  rejected_count: number;
  source: string;
  status: string;
  error: string | null;
  created_at: string;
};

function GeneratorPage() {
  const qc = useQueryClient();
  const runGeneration = useServerFn(generateLeads);
  const advanceGeneration = useServerFn(advanceLeadGeneration);
  const [category, setCategory] = useState("Barbershop");
  const [location, setLocation] = useState("");
  const [count, setCount] = useState("10");
  const [results, setResults] = useState<GeneratedLead[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [reportedRunId, setReportedRunId] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["leadgen-status"],
    queryFn: () => getLeadGenStatus(),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["lead_gen_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_gen_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as RunRow[];
    },
  });

  useEffect(() => {
    if (activeRunId) return;
    const resumable = runs.find((run) => run.status === "SOURCING" || run.status === "QUALIFYING");
    if (resumable) setActiveRunId(resumable.id);
  }, [activeRunId, runs]);

  const todayCreated = useMemo(() => {
    const today = new Date().toDateString();
    return runs
      .filter((r) => new Date(r.created_at).toDateString() === today)
      .reduce((sum, r) => sum + (r.created_count ?? 0), 0);
  }, [runs]);

  const generate = useMutation({
    mutationFn: async () =>
      runGeneration({
        data: { category: category.trim(), location: location.trim(), count: Number(count) || 10 },
      }),
    onSuccess: (res) => {
      setResults([]);
      setReportedRunId(null);
      setActiveRunId(res.runId);
      qc.invalidateQueries({ queryKey: ["lead_gen_runs"] });
      toast.success("Lead generation started", { description: `${res.source} is sourcing businesses now.` });
    },
    onError: (err: Error) => toast.error("Lead generation failed", { description: err.message }),
  });

  const { data: activeRun } = useQuery({
    queryKey: ["lead-generation-progress", activeRunId],
    queryFn: () => advanceGeneration({ data: { runId: activeRunId ?? "" } }),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const run = query.state.data;
      return run?.status === "COMPLETED" || run?.status === "FAILED" ? false : 5000;
    },
    retry: 1,
  });

  useEffect(() => {
    if (!activeRun || reportedRunId === activeRun.id) return;
    if (activeRun.status === "COMPLETED") {
      setReportedRunId(activeRun.id);
      setResults(activeRun.leads);
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["lead_gen_runs"] });
      toast.success(`${activeRun.created_count} leads added to Lead Tracker`, {
        description: `${activeRun.skipped_duplicates} duplicates skipped · ${activeRun.rejected_count} filtered out · source ${activeRun.source}`,
      });
    } else if (activeRun.status === "FAILED") {
      setReportedRunId(activeRun.id);
      void qc.invalidateQueries({ queryKey: ["lead_gen_runs"] });
      toast.error("Lead generation failed", { description: activeRun.error ?? "The provider job did not complete." });
    }
  }, [activeRun, qc, reportedRunId]);

  const progress = Math.min(100, Math.round((todayCreated / DAILY_TARGET) * 100));

  return (
    <AppShell
      title="Lead Generator"
      subtitle="Pick a business type, a location and how many leads you want — Numo sources, qualifies, scores and personalizes them."
      actions={
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/leads">Open Lead Tracker</Link>
        </Button>
      }
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-gold" />
            <h2 className="font-display text-lg font-semibold">Run lead generation</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Chains and poor fits are filtered out, small family-owned businesses are favoured, duplicates are skipped and
            every kept lead gets a score, a human opening line under 30 words and a recommended outreach channel.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Business type
              </span>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_PRESETS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Custom type (optional)
              </span>
              <Input
                className="rounded-full"
                placeholder="e.g. Mobile detailing"
                onChange={(e) => {
                  if (e.target.value.trim()) setCategory(e.target.value);
                }}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Location</span>
              <Input
                className="rounded-full"
                placeholder="City, region"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid w-full gap-2 sm:max-w-[180px]">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Number of leads
              </span>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger className="rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["5", "10", "15", "25", "50"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n} leads
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90 sm:ml-auto"
              disabled={generate.isPending || Boolean(activeRunId && activeRun?.status !== "COMPLETED" && activeRun?.status !== "FAILED") || !location.trim()}
              onClick={() => generate.mutate()}
            >
              {generate.isPending || (activeRunId && activeRun?.status !== "COMPLETED" && activeRun?.status !== "FAILED") ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> {activeRun?.status === "QUALIFYING" ? "Qualifying…" : "Sourcing…"}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 size-4" /> Generate leads
                </>
              )}
            </Button>
          </div>

          {generate.isPending || (activeRunId && activeRun?.status !== "COMPLETED" && activeRun?.status !== "FAILED") ? (
            <div className="mt-5 space-y-2 rounded-2xl border border-border bg-secondary/50 p-4 text-sm">
              <Step done={activeRun?.status === "QUALIFYING"} label="Sourcing businesses with Apify" active={activeRun?.status !== "QUALIFYING"} />
              <Step done={false} label="OpenAI qualification, scoring & dedupe" active={activeRun?.status === "QUALIFYING"} />
              <Step done={false} label="Writing personalized opening lines" active={activeRun?.status === "QUALIFYING"} />
              <Step done={false} label="Saving into Lead Tracker" active={activeRun?.status === "QUALIFYING"} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4">
          <div className="panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Daily target</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {todayCreated}
              <span className="text-base text-muted-foreground"> / {DAILY_TARGET}</span>
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{progress}% of today's 50-lead goal</p>
          </div>

          <div className="panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pipeline sources</p>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Radar className="size-4 text-gold" />
                <span className="flex-1">Apify · Google Maps</span>
                <Badge ok={Boolean(status?.apifyConnected)}>
                  {status?.apifyConnected ? "Connected" : "Ready to connect"}
                </Badge>
              </li>
              <li className="flex items-center gap-3">
                <Bot className="size-4 text-gold" />
                <span className="flex-1">AI qualification · {status?.aiProvider ?? "—"}</span>
                <Badge ok={Boolean(status?.aiProvider)}>{status?.aiProvider ? "Active" : "Offline"}</Badge>
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Qualification, scoring, personalized lines and outreach channel run on your own OpenAI key when it is
              configured. Each run records the exact provider pair in its history row.
            </p>

          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Generated today" value={todayCreated} icon={Sparkles} tone="gold" />
        <KpiCard label="Runs logged" value={runs.length} icon={Layers} />
        <KpiCard
          label="Leads added (all runs)"
          value={runs.reduce((s, r) => s + (r.created_count ?? 0), 0)}
          icon={Target}
        />
        <KpiCard
          label="Duplicates skipped"
          value={runs.reduce((s, r) => s + (r.skipped_duplicates ?? 0), 0)}
          icon={Copy}
        />
      </section>

      {results.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Latest batch</h2>
          <TableShell>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-ink text-ink-foreground">
                <tr>
                  <Th>Business</Th>
                  <Th>Location</Th>
                  <Th>Contact</Th>
                  <Th>Score</Th>
                  <Th>Channel</Th>
                  <Th>Opening line</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((l) => (
                  <tr key={l.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">{l.business_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.location || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.email || l.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex min-w-10 items-center justify-center rounded-full border border-gold/40 bg-gold-soft px-2 py-1 text-xs font-semibold text-gold-foreground">
                        {l.lead_score ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.outreach_channel || "—"}</td>
                    <td className="max-w-[360px] px-4 py-3 text-muted-foreground">{l.personalized_line || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Generation history</h2>
        <TableShell>
          {runs.length === 0 ? (
            <EmptyState
              title="No generation runs yet"
              hint="Choose a business type and location above, then hit Generate leads."
            />
          ) : (
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-ink text-ink-foreground">
                <tr>
                  <Th>When</Th>
                  <Th>Search</Th>
                  <Th>Added</Th>
                  <Th>Duplicates</Th>
                  <Th>Filtered</Th>
                  <Th>Source</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border/70">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 font-medium">
                      {r.category} · {r.location}
                    </td>
                    <td className="px-4 py-3">{r.created_count}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.skipped_duplicates}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.rejected_count}</td>
                    <td className="px-4 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">{r.source}</td>
                    <td className="px-4 py-3">
                      <Badge ok={r.status === "COMPLETED"}>{r.status}</Badge>
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

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${
        ok ? "border-gold/40 bg-gold-soft text-gold-foreground" : "border-border bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function Step({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {done ? (
        <CheckCircle2 className="size-4 text-gold" />
      ) : active ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <MapPin className="size-4" />
      )}
      <span>{label}</span>
    </div>
  );
}
