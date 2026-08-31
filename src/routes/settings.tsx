import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, MessageSquare, Sheet, Workflow, Plug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell } from "@/components/crm/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getLeadGenStatus } from "@/lib/leadgen.functions";
import { EmailOutreachSettings } from "@/components/crm/EmailOutreachSettings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Integrations — Numo CRM" },
      {
        name: "description",
        content: "Workspace settings and connection-ready modules for Apify, OpenAI, SMS outreach and Google Sheets sync.",
      },
      { property: "og:title", content: "Settings & Integrations — Numo CRM" },
      { property: "og:description", content: "Manage your Numo workspace and prepare future automation integrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  ),
});

type Module = {
  name: string;
  icon: LucideIcon;
  description: string;
  status: "Connection ready" | "Planned";
  detail: string;
};

const MODULES: Module[] = [
  {
    name: "Apify lead generation",
    icon: Database,
    description: "Scrape local businesses by category and location, then push results straight into the Lead Tracker.",
    status: "Connection ready",
    detail: "Maps to leads: business_name, category, location, phone, email, website, business_hours.",
  },
  {
    name: "OpenAI personalized lines",
    icon: Bot,
    description: "Generate a sub-30-word personalized opener and suggest next-best outreach actions per lead.",
    status: "Connection ready",
    detail: "Writes to leads.personalized_line and leads.notes.",
  },
  {
    name: "SMS outreach",
    icon: MessageSquare,
    description: "Send and log SMS touchpoints against a lead, auto-advancing outreach status.",
    status: "Planned",
    detail: "Will update leads.status through CONTACTED → REPLIED.",
  },
  {
    name: "Google Sheets sync",
    icon: Sheet,
    description: "Two-way mirror of the Lead Tracker for team members who prefer spreadsheets.",
    status: "Planned",
    detail: "Column order matches the Lead Tracker table exactly.",
  },
  {
    name: "n8n automations",
    icon: Workflow,
    description: "Trigger workflows on status changes, new meetings, or invoices marked as sent.",
    status: "Planned",
    detail: "Webhook endpoints will live under /api/public/*.",
  },
];

function SettingsPage() {
  const { user } = useAuth();
  const { data: status } = useQuery({
    queryKey: ["leadgen-status"],
    queryFn: () => getLeadGenStatus(),
  });


  return (
    <AppShell
      title="Settings & Integrations"
      subtitle="Your workspace details and the automation modules Numo CRM is wired to accept next."
    >
      <section className="panel p-6">
        <h2 className="font-display text-lg font-semibold">Workspace</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Signed in as</dt>
            <dd className="mt-1 text-sm font-medium">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Brand</dt>
            <dd className="mt-1 text-sm font-medium">Numo Marketing</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Data privacy</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              All leads, meetings, clients and invoices are private to your account.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Invoice prefix</dt>
            <dd className="mt-1 text-sm font-medium">NUMO-{new Date().getFullYear()}-0001</dd>
          </div>
        </dl>
      </section>

      <section className="panel mt-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Lead sourcing credentials</h2>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className={
                status?.apifyConnected
                  ? "border-gold/50 bg-gold-soft text-gold-foreground"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              Apify {status?.apifyConnected ? "connected" : "not connected"}
            </Badge>
            <Badge
              variant="outline"
              className={
                status?.aiConnected
                  ? "border-gold/50 bg-gold-soft text-gold-foreground"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              AI {status?.aiConnected ? "connected" : "not connected"}
            </Badge>
            <Badge
              variant="outline"
              className={
                status?.openaiConfigured
                  ? "border-gold/50 bg-gold-soft text-gold-foreground"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              OpenAI key {status?.openaiConfigured ? "detected" : "not set"}
            </Badge>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Add your Apify API token privately in <span className="font-medium text-foreground">Project Settings → Secrets</span>{" "}
          using the name <code className="rounded bg-muted px-1.5 py-0.5 text-xs">APIFY_API_TOKEN</code>. The token is stored
          server-side only — it is never sent to the browser, logged, or shown here. Once saved, the Lead Generator switches
          from AI-sourced candidates to live Google Maps scraping automatically.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Lead qualification, scoring, personalized lines and outreach channel now run on your own OpenAI key via the
          secret named <code className="rounded bg-muted px-1.5 py-0.5 text-xs">OPENAI_API_KEY</code>. It is read
          server-side only. Active AI provider:{" "}
          <span className="font-medium text-foreground">{status?.aiProvider ?? "none configured"}</span>. If the key is
          removed, generation falls back to the managed AI provider rather than inventing leads.
        </p>

      </section>

      <EmailOutreachSettings />

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Integration modules</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {MODULES.map((m) => (
            <article key={m.name} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-gold/15 text-gold-foreground">
                  <m.icon className="size-4" />
                </span>
                <Badge
                  variant="outline"
                  className={
                    m.status === "Connection ready"
                      ? "border-gold/50 bg-gold-soft text-gold-foreground"
                      : "border-border bg-muted text-muted-foreground"
                  }
                >
                  {m.status}
                </Badge>
              </div>
              <div>
                <h3 className="font-display text-base font-semibold">{m.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
              </div>
              <p className="text-xs text-muted-foreground">{m.detail}</p>
              <Button variant="outline" className="mt-auto w-fit rounded-full" disabled>
                Connect (coming soon)
              </Button>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
