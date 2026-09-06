import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, MessageSquareReply, CalendarCheck, Flame, Inbox, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/crm/RequireAuth";
import { AppShell, EmptyState, TableShell } from "@/components/crm/AppShell";
import { KpiCard } from "@/components/crm/KpiCard";
import { formatDateTime } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/sms-outreach")({
  head: () => ({
    meta: [
      { title: "SMS Outreach — Numo CRM" },
      {
        name: "description",
        content: "Track SMS replies, meeting interest and follow-ups across every outreach lead.",
      },
      { property: "og:title", content: "SMS Outreach — Numo CRM" },
      { property: "og:description", content: "Replies, meeting requests and follow-up flags for SMS outreach leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SmsOutreachPage />
    </RequireAuth>
  ),
});

type LeadRow = {
  id: string;
  business_name: string;
  phone_e164: string | null;
  phone: string | null;
  sms_consent: boolean;
  status: string;
  conversation_status: string;
  reply_detected: boolean;
  opted_out: boolean;
  last_sms_sent: string | null;
  last_reply: string | null;
  last_contacted_at: string | null;
};

type MessageRow = {
  message_id: string;
  lead_id: string;
  direction: string;
  message_body: string;
  created_at: string;
};

type MeetingRow = {
  id: string;
  lead_id: string | null;
  scheduled_at: string;
  status: string;
};

type Tab = "ALL" | "REPLIED" | "WANTS_MEETING" | "MEETING_BOOKED" | "NO_REPLY";

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "REPLIED", label: "Replied" },
  { key: "MEETING_BOOKED", label: "Meeting Booked" },
  { key: "WANTS_MEETING", label: "Wants Meeting" },
  { key: "NO_REPLY", label: "No Reply Yet" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string, max = 80) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function YesNo({ value }: { value: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
        value ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border",
      )}
    >
      {value ? "Yes" : "No"}
    </span>
  );
}

function SmsOutreachPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("ALL");

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["sms-outreach-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, business_name, phone_e164, phone, sms_consent, status, conversation_status, reply_detected, opted_out, last_sms_sent, last_reply, last_contacted_at",
        )
        .order("business_name", { ascending: true });
      if (error) throw error;
      return data as LeadRow[];
    },
  });

  const { data: inboundMessages = [] } = useQuery({
    queryKey: ["sms-outreach-inbound"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("message_id, lead_id, direction, message_body, created_at")
        .eq("direction", "inbound")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MessageRow[];
    },
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["sms-outreach-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, lead_id, scheduled_at, status")
        .not("lead_id", "is", null)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data as MeetingRow[];
    },
  });

  // Latest inbound message per lead.
  const lastInbound = useMemo(() => {
    const map = new Map<string, MessageRow>();
    for (const m of inboundMessages) if (!map.has(m.lead_id)) map.set(m.lead_id, m);
    return map;
  }, [inboundMessages]);

  // Earliest upcoming / most recent meeting per lead.
  const meetingByLead = useMemo(() => {
    const map = new Map<string, MeetingRow>();
    for (const mtg of meetings) {
      if (mtg.lead_id && !map.has(mtg.lead_id)) map.set(mtg.lead_id, mtg);
    }
    return map;
  }, [meetings]);

  const rows = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return leads.map((l) => {
      const inbound = lastInbound.get(l.id);
      const replied = l.reply_detected || Boolean(inbound) || Boolean(l.last_reply);
      const replyText = l.last_reply ?? inbound?.message_body ?? null;
      const replyAt = inbound?.created_at ?? null;
      const wantsMeeting = ["MEETING REQUESTED", "HOT LEAD"].includes(
        (l.conversation_status ?? "").toUpperCase(),
      );
      const meeting = meetingByLead.get(l.id) ?? null;
      const lastContact = l.last_contacted_at ? new Date(l.last_contacted_at).getTime() : 0;
      const needsFollowUp =
        replied &&
        !l.opted_out &&
        !["CLIENT", "NOT INTERESTED"].includes(l.status) &&
        (!lastContact || lastContact < dayAgo);
      return { lead: l, replied, replyText, replyAt, wantsMeeting, meeting, needsFollowUp };
    });
  }, [leads, lastInbound, meetingByLead]);

  const stats = useMemo(() => {
    const inOutreach = leads.filter((l) => l.sms_consent).length;
    const sent = leads.filter((l) => l.last_sms_sent).length;
    const replied = rows.filter((r) => r.replied).length;
    const booked = rows.filter((r) => r.meeting).length;
    return {
      inOutreach,
      sent,
      replied,
      replyRate: sent ? Math.round((replied / sent) * 100) : 0,
      booked,
      followUps: rows.filter((r) => r.needsFollowUp).length,
    };
  }, [leads, rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.lead.business_name.toLowerCase().includes(q)) return false;
      switch (tab) {
        case "REPLIED":
          return r.replied;
        case "WANTS_MEETING":
          return r.wantsMeeting;
        case "MEETING_BOOKED":
          return Boolean(r.meeting);
        case "NO_REPLY":
          return !r.replied;
        default:
          return true;
      }
    });
  }, [rows, search, tab]);

  return (
    <AppShell
      title="SMS Outreach"
      subtitle="Replies, meeting interest and follow-ups across every SMS outreach lead — read-only, live from your leads, messages and meetings."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="In SMS Outreach" value={stats.inOutreach} icon={MessageSquare} tone="ink" hint="consent recorded" />
        <KpiCard label="Messages Sent" value={stats.sent} hint="have a last SMS" />
        <KpiCard label="Replied" value={stats.replied} icon={MessageSquareReply} hint={`${stats.followUps} need follow-up`} />
        <KpiCard label="Reply Rate" value={`${stats.replyRate}%`} tone="gold" />
        <KpiCard label="Meetings Booked" value={stats.booked} icon={CalendarCheck} />
      </div>

      <div className="panel mt-6 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "bg-gold text-gold-foreground"
                  : "text-muted-foreground hover:bg-gold/10 hover:text-ink-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business…"
            className="rounded-full pl-9"
          />
        </div>
      </div>

      <TableShell className="mt-4">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="bg-ink text-[11px] font-semibold tracking-[0.12em] text-ink-muted">
              <th className="px-4 py-4 text-left uppercase">Business</th>
              <th className="px-4 py-4 text-left uppercase">Phone</th>
              <th className="px-4 py-4 text-left uppercase">Replied</th>
              <th className="px-4 py-4 text-left uppercase">Wants Meeting</th>
              <th className="px-4 py-4 text-left uppercase">Meeting Booked</th>
              <th className="px-4 py-4 text-left uppercase">Flags</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.lead.id}
                className={cn(
                  "border-t border-border transition-colors hover:bg-secondary/60",
                  r.needsFollowUp && "bg-warning/10",
                )}
              >
                <td className="px-4 py-4 font-medium">{r.lead.business_name}</td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                  {r.lead.phone_e164 || r.lead.phone || "—"}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-1">
                    <YesNo value={r.replied} />
                    {r.replied && r.replyText ? (
                      <p className="max-w-[280px] text-xs text-muted-foreground">
                        “{truncate(r.replyText)}”
                        {r.replyAt ? <span className="block text-[11px]">{timeAgo(r.replyAt)}</span> : null}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <YesNo value={r.wantsMeeting} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-1">
                    <YesNo value={Boolean(r.meeting)} />
                    {r.meeting ? (
                      <p className="text-xs text-muted-foreground">{formatDateTime(r.meeting.scheduled_at)}</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4">
                  {r.needsFollowUp ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-warning/40 bg-warning/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold-foreground">
                      <Flame className="size-3" /> Needs follow-up
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && visible.length === 0 ? (
          <EmptyState
            title={tab === "ALL" ? "No leads yet" : "Nothing in this view"}
            hint={
              tab === "ALL"
                ? "Leads from the Lead Tracker appear here automatically once they exist."
                : "Try another tab — rows move here as replies and meetings come in."
            }
            action={<Inbox className="size-5 text-muted-foreground" />}
          />
        ) : null}
      </TableShell>
    </AppShell>
  );
}
