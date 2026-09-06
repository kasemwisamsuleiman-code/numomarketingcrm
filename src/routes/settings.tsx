import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, MessageSquare, Sheet, Workflow, Plug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell } from "@/components/crm/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { EmailOutreachSettings } from "@/components/crm/EmailOutreachSettings";
import { SmsOutreachSettings } from "@/components/crm/SmsOutreachSettings";
import { TeamAccess } from "@/components/crm/TeamAccess";


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
              Only approved team emails can access this workspace.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Invoice prefix</dt>
            <dd className="mt-1 text-sm font-medium">NUMO-{new Date().getFullYear()}-0001</dd>
          </div>
        </dl>
      </section>

      <TeamAccess />



      <EmailOutreachSettings />

      <SmsOutreachSettings />

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
