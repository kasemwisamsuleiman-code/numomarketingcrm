import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Send, Repeat, MessageSquare, Ban, Play, ListPlus, X, ShieldAlert, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { StatusPill } from "@/components/crm/StatusPill";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/crm";
import {
  OUTREACH_CHANNELS,
  OUTREACH_SELECT,
  OUTREACH_TONE,
  applyConverted,
  applyMeetingSet,
  findDuplicateIds,
  isFollowUpDue,
  isEligibleForOutreach,
  markReplied,
  optOutLead,
  queueLead,
  setSmsConsent,
  setStopOutreach,
  simulateFollowUp,
  simulateSend,
  unqueueLead,
  type AutomationLog,
  type OutreachChannel,
  type OutreachLead,
} from "@/lib/outreach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildEmail, isValidEmail, type EmailKind, type EmailSettings } from "@/lib/email-template";
import { sendLeadEmail } from "@/lib/email.functions";
import { EmailOutreachSettings } from "@/components/crm/EmailOutreachSettings";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Outreach Automation — Numo CRM" },
      {
        name: "description",
        content:
          "Queue leads for email or SMS outreach, simulate sends and follow-ups, track replies and review every automation event.",
      },
      { property: "og:title", content: "Outreach Automation — Numo CRM" },
      { property: "og:description", content: "Safe, simulation-only outreach queue and automation event log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AutomationPage />
    </RequireAuth>
  ),
});

type Tab = "queue" | "contacted" | "replies" | "followups" | "stopped" | "eligible" | "logs";

function ChannelPill({ channel }: { channel: string | null }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{channel ?? "—"}</span>
  );
}

function AutomationPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<OutreachChannel>("EMAIL");
  const [tab, setTab] = useState<Tab>("eligible");
  const [sendTarget, setSendTarget] = useState<{ lead: OutreachLead; kind: EmailKind } | null>(null);

  const { data: emailSettings } = useQuery({
    queryKey: ["email-settings", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("email_settings").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data as unknown as EmailSettings) ?? null;
    },
  });

  const { data: suppressed = [] } = useQuery({
    queryKey: ["email-suppressions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_suppressions").select("email");
      if (error) throw error;
      return data.map((r) => r.email.toLowerCase());
    },
  });

  const liveEmail = Boolean(emailSettings?.live_enabled);
  const isSuppressed = (lead: OutreachLead) => suppressed.includes((lead.email ?? "").trim().toLowerCase());
  const canSendReal = (lead: OutreachLead) =>
    liveEmail &&
    (lead.outreach_channel ?? "EMAIL") === "EMAIL" &&
    isValidEmail(lead.email) &&
    isEligibleForOutreach(lead, "EMAIL") &&
    !isSuppressed(lead);

  const sendReal = useMutation({
    mutationFn: async ({ lead, kind }: { lead: OutreachLead; kind: EmailKind }) =>
      sendLeadEmail({ data: { leadId: lead.id, kind } }),
    onSuccess: (r) => {
      setSendTarget(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["email-sends"] });
      toast.success(`Email sent to ${r.to} (id ${r.messageId})`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendPreview = useMemo(
    () => (sendTarget && emailSettings ? buildEmail(emailSettings, sendTarget.lead, sendTarget.kind) : null),
    [sendTarget, emailSettings],
  );

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["outreach-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(OUTREACH_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OutreachLead[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["automation-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_logs")
        .select("id, lead_id, lead_name, action, channel, result, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as AutomationLog[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["outreach-leads"] });
    qc.invalidateQueries({ queryKey: ["automation-logs"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["meetings"] });
  };

  const act = useMutation({
    mutationFn: async ({ run, label }: { run: () => Promise<void>; label: string }) => {
      await run();
      return label;
    },
    onSuccess: (label) => {
      refresh();
      toast.success(label);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateIds = useMemo(() => findDuplicateIds(leads), [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.business_name, l.category, l.location, l.email, l.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [leads, search]);

  const buckets = useMemo(() => {
    const now = Date.now();
    return {
      eligible: filtered.filter(
        (l) => l.outreach_status === "NOT_QUEUED" && isEligibleForOutreach(l, channel) && ["READY", "PENDING"].includes(l.status),
      ),
      queue: filtered.filter((l) => l.outreach_status === "QUEUED" && !l.stop_outreach),
      contacted: filtered.filter((l) => l.outreach_status === "CONTACTED"),
      replies: filtered.filter((l) => l.reply_detected),
      followups: filtered.filter((l) => isFollowUpDue(l, now)),
      stopped: filtered.filter((l) => l.stop_outreach),
    };
  }, [filtered, channel]);

  const kpis = {
    queued: leads.filter((l) => l.outreach_status === "QUEUED" && !l.stop_outreach).length,
    contacted: leads.filter((l) => l.outreach_status === "CONTACTED").length,
    replies: leads.filter((l) => l.reply_detected).length,
    due: leads.filter((l) => isFollowUpDue(l)).length,
    stopped: leads.filter((l) => l.stop_outreach).length,
  };

  const run = (label: string, fn: () => Promise<void>) => act.mutate({ run: fn, label });

  const rowActions = (lead: OutreachLead) => (
    <div className="flex flex-wrap justify-end gap-1">
      {lead.outreach_status === "NOT_QUEUED" && !lead.stop_outreach ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-gold/40"
          onClick={() => run(`${lead.business_name} queued for ${channel}`, () => queueLead(user!.id, lead, channel))}
        >
          <ListPlus className="mr-1 size-3.5" /> Queue
        </Button>
      ) : null}
      {lead.outreach_status === "QUEUED" ? (
        <>
          <Button
            size="sm"
            className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
            onClick={() => run(`Simulated send to ${lead.business_name} (nothing sent)`, () => simulateSend(user!.id, lead))}
          >
            <Send className="mr-1 size-3.5" /> Test send
          </Button>
          {canSendReal(lead) ? (
            <Button
              size="sm"
              className="rounded-full bg-gold text-gold-foreground hover:bg-gold/90"
              onClick={() => setSendTarget({ lead, kind: "INITIAL" })}
            >
              <Mail className="mr-1 size-3.5" /> Send email
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-gold/40"
            onClick={() => run(`${lead.business_name} removed from queue`, () => unqueueLead(user!.id, lead))}
          >
            <X className="mr-1 size-3.5" /> Unqueue
          </Button>
        </>
      ) : null}
      {lead.outreach_status === "CONTACTED" && !lead.stop_outreach ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-gold/40"
          onClick={() => run(`Simulated follow-up for ${lead.business_name}`, () => simulateFollowUp(user!.id, lead))}
        >
          <Repeat className="mr-1 size-3.5" /> Test follow-up
        </Button>
      ) : null}
      {lead.outreach_status === "CONTACTED" && canSendReal(lead) ? (
        <Button
          size="sm"
          className="rounded-full bg-gold text-gold-foreground hover:bg-gold/90"
          onClick={() => setSendTarget({ lead, kind: "FOLLOW_UP" })}
        >
          <Mail className="mr-1 size-3.5" /> Send follow-up
        </Button>
      ) : null}
      {!lead.reply_detected && lead.outreach_status === "CONTACTED" ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-gold/40"
          onClick={() => run(`Reply recorded for ${lead.business_name}`, () => markReplied(user!.id, lead))}
        >
          <MessageSquare className="mr-1 size-3.5" /> Mark replied
        </Button>
      ) : null}
      {lead.status !== "MEETING SET" && lead.status !== "CLIENT" ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-gold/40"
          onClick={() =>
            run(`${lead.business_name} marked MEETING SET`, () =>
              applyMeetingSet(user!.id, lead.id, lead.business_name),
            )
          }
        >
          Meeting set
        </Button>
      ) : null}
      {lead.status !== "CLIENT" ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-gold/40"
          onClick={() =>
            run(`${lead.business_name} marked CLIENT`, () => applyConverted(user!.id, lead.id, lead.business_name))
          }
        >
          Converted
        </Button>
      ) : null}
      {lead.phone ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-gold/40"
          onClick={() =>
            run(
              lead.sms_consent ? `SMS consent revoked for ${lead.business_name}` : `SMS consent recorded for ${lead.business_name}`,
              () => setSmsConsent(user!.id, lead, !lead.sms_consent, "Manually recorded by owner"),
            )
          }
        >
          {lead.sms_consent ? "Revoke SMS consent" : "Record SMS consent"}
        </Button>
      ) : null}
      {!lead.opted_out ? (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-destructive/40 text-destructive"
          onClick={() => run(`${lead.business_name} opted out`, () => optOutLead(user!.id, lead, "Manual opt-out"))}
        >
          <ShieldAlert className="mr-1 size-3.5" /> Opt out
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="rounded-full border-gold/40"
        disabled={lead.opted_out && lead.stop_outreach}
        onClick={() =>
          run(
            lead.stop_outreach ? `${lead.business_name} resumed` : `${lead.business_name} stopped`,
            () => setStopOutreach(user!.id, lead, !lead.stop_outreach),
          )
        }
      >
        {lead.stop_outreach ? <Play className="mr-1 size-3.5" /> : <Ban className="mr-1 size-3.5" />}
        {lead.stop_outreach ? "Resume" : "Stop"}
      </Button>
    </div>
  );

  const leadTable = (rows: OutreachLead[], emptyTitle: string, emptyHint: string) => (
    <TableShell className="mt-4">
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <th className="px-4 py-4 text-left">Business</th>
              <th className="px-4 py-4 text-left">Contact</th>
              <th className="px-4 py-4 text-left">Channel</th>
              <th className="px-4 py-4 text-left">Outreach</th>
              <th className="px-4 py-4 text-left">Step</th>
              <th className="px-4 py-4 text-left">Tracker</th>
              <th className="px-4 py-4 text-left">Last contacted</th>
              <th className="px-4 py-4 text-left">Next follow-up</th>
              <th className="px-4 py-4 text-right">Test controls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr key={lead.id} className="border-b border-border/70 last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {lead.business_name}
                    {duplicateIds.has(lead.id) ? (
                      <span
                        title="Possible duplicate (matches another lead by name, phone, email or website)"
                        className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-gold-foreground"
                      >
                        <ShieldAlert className="size-3" /> Dup
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{lead.location ?? "—"}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <p>{lead.email ?? "—"}</p>
                  <p>{lead.phone ?? "—"}</p>
                </td>
                <td className="px-4 py-3">
                  <ChannelPill channel={lead.outreach_channel} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
                      OUTREACH_TONE[lead.outreach_status] ?? "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {lead.outreach_status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <p>Step {lead.sequence_step ?? 0}</p>
                  {lead.opted_out ? <p className="font-semibold text-destructive">Opted out</p> : null}
                  {lead.sms_consent ? <p className="text-success">SMS consent</p> : null}
                </td>
                <td className="px-4 py-3">

                  <StatusPill status={lead.status} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(lead.last_contacted_at)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(lead.next_follow_up_at)}</td>
                <td className="px-4 py-3 text-right">{rowActions(lead)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableShell>
  );

  return (
    <AppShell
      title="Outreach Automation"
      subtitle="Queue leads, manage email outreach and audit every automation event. Bulk sending stays off — real emails go out one lead at a time, only when live email is enabled."
      actions={
        <Select value={channel} onValueChange={(v) => setChannel(v as OutreachChannel)}>
          <SelectTrigger className="w-44 rounded-full">
            <SelectValue placeholder="Queue channel" />
          </SelectTrigger>
          <SelectContent>
            {OUTREACH_CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                Queue as {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="panel mb-6 flex items-start gap-3 border-gold/40 bg-gold-soft/60 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 text-gold-foreground" />
        {liveEmail ? (
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">Live email sending is ON.</span> “Send email” delivers a real
            message to one lead at a time and only marks the lead CONTACTED when the provider accepts it. Every “test”
            control stays simulation-only, and SMS is not connected.
          </p>
        ) : (
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">Dry-run mode.</span> Live email outreach is disabled in
            Settings, so every control below only moves the lead through the pipeline and writes an automation log entry.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Queued" value={kpis.queued} tone="gold" />
        <KpiCard label="Contacted" value={kpis.contacted} tone="ink" />
        <KpiCard label="Replies" value={kpis.replies} />
        <KpiCard label="Follow-ups Due" value={kpis.due} />
        <KpiCard label="Stopped" value={kpis.stopped} />
      </div>

      <EmailOutreachSettings />


      <div className="panel mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads in the automation pipeline…"
            className="rounded-full pl-9"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-full bg-muted p-1">
          <TabsTrigger className="rounded-full" value="eligible">
            Eligible ({buckets.eligible.length})
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value="queue">
            Queue ({buckets.queue.length})
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value="contacted">
            Contacted ({buckets.contacted.length})
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value="replies">
            Replies ({buckets.replies.length})
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value="followups">
            Follow-ups due ({buckets.followups.length})
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value="stopped">
            Stopped ({buckets.stopped.length})
          </TabsTrigger>
          <TabsTrigger className="rounded-full" value="logs">
            Logs ({logs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="eligible">
          {leadTable(
            buckets.eligible,
            isLoading ? "Loading leads…" : "No eligible leads",
            "Leads with status READY or PENDING that are not queued yet appear here.",
          )}
        </TabsContent>
        <TabsContent value="queue">
          {leadTable(buckets.queue, "Queue is empty", "Queue a lead from the Eligible tab to stage outreach.")}
        </TabsContent>
        <TabsContent value="contacted">
          {leadTable(buckets.contacted, "Nobody contacted yet", "Run a test send to move a queued lead to CONTACTED.")}
        </TabsContent>
        <TabsContent value="replies">
          {leadTable(buckets.replies, "No replies recorded", "Use “Mark replied” on a contacted lead to simulate a reply.")}
        </TabsContent>
        <TabsContent value="followups">
          {leadTable(
            buckets.followups,
            "No follow-ups due",
            "Contacted leads become due here once their next follow-up time passes.",
          )}
        </TabsContent>
        <TabsContent value="stopped">
          {leadTable(buckets.stopped, "No stopped leads", "Replies, meetings and conversions stop outreach automatically.")}
        </TabsContent>

        <TabsContent value="logs">
          <TableShell className="mt-4">
            {logs.length === 0 ? (
              <EmptyState title="No automation events yet" hint="Every queue, send, reply and conversion is logged here." />
            ) : (
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="bg-ink text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    <th className="px-4 py-4 text-left">When</th>
                    <th className="px-4 py-4 text-left">Lead</th>
                    <th className="px-4 py-4 text-left">Action</th>
                    <th className="px-4 py-4 text-left">Channel</th>
                    <th className="px-4 py-4 text-left">Result</th>
                    <th className="px-4 py-4 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-border/70 last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3 font-medium">{log.lead_name || "—"}</td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                        {log.action.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3">
                        <ChannelPill channel={log.channel} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {log.result}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{log.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableShell>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(sendTarget)} onOpenChange={(open) => (open ? null : setSendTarget(null))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Send a real {sendTarget?.kind === "FOLLOW_UP" ? "follow-up" : "first"} email
            </DialogTitle>
            <DialogDescription>
              This sends immediately to {sendTarget?.lead.email} via your connected email provider.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Subject</p>
            <p className="mt-1 text-sm font-semibold">{sendPreview?.subject}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{sendPreview?.body}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setSendTarget(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
              disabled={sendReal.isPending || !sendTarget}
              onClick={() => sendTarget && sendReal.mutate(sendTarget)}
            >
              {sendReal.isPending ? "Sending…" : "Confirm and send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
