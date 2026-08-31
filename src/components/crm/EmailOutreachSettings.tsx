import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Mail, Send, ShieldOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/crm";
import {
  TEMPLATE_VARIABLES,
  buildEmail,
  isValidEmail,
  type EmailSettings,
} from "@/lib/email-template";
import {
  getEmailDeliveryStatus,
  getEmailProviderStatus,
  sendTestEmail,
  suppressEmail,
} from "@/lib/email.functions";

const SAMPLE_LEAD = {
  business_name: "Rosa's Family Diner",
  category: "restaurant",
  location: "Portland, OR",
  personalized_line: "Loved that your breakfast menu is still all-day after 22 years on Alberta Street.",
};

export function EmailOutreachSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<EmailSettings | null>(null);
  const [testTo, setTestTo] = useState("");
  const [suppressTarget, setSuppressTarget] = useState("");
  const [delivery, setDelivery] = useState<Record<string, string>>({});

  const checkDelivery = useMutation({
    mutationFn: async (messageId: string) => ({
      messageId,
      result: await getEmailDeliveryStatus({ data: { messageId } }),
    }),
    onSuccess: ({ messageId, result }) => {
      setDelivery((prev) => ({ ...prev, [messageId]: result.lastEvent }));
      if (!result.ok && result.detail) toast.error(result.detail);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: status } = useQuery({
    queryKey: ["email-provider-status"],
    queryFn: () => getEmailProviderStatus(),
  });

  const { data: settings } = useQuery({
    queryKey: ["email-settings", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("email_settings").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      if (data) return data as unknown as EmailSettings;
      const { data: created, error: insertError } = await supabase
        .from("email_settings")
        .insert({ user_id: user!.id })
        .select("*")
        .single();
      if (insertError) throw insertError;
      return created as unknown as EmailSettings;
    },
  });

  const { data: suppressions = [] } = useQuery({
    queryKey: ["email-suppressions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_suppressions")
        .select("id, email, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: sends = [] } = useQuery({
    queryKey: ["email-sends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_sends")
        .select("id, lead_name, to_email, subject, kind, status, error, provider_message_id, attempt_no, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const save = useMutation({
    mutationFn: async (next: EmailSettings) => {
      const { user_id: _ignored, ...patch } = next;
      const { error } = await supabase.from("email_settings").update(patch).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-settings"] });
      toast.success("Email settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => sendTestEmail({ data: { to: testTo.trim(), kind: "INITIAL" } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["email-sends"] });
      toast.success(`Test email sent (id ${r.messageId})`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suppress = useMutation({
    mutationFn: async () => suppressEmail({ data: { email: suppressTarget.trim(), reason: "MANUAL" } }),
    onSuccess: () => {
      setSuppressTarget("");
      qc.invalidateQueries({ queryKey: ["email-suppressions"] });
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
      toast.success("Address suppressed — it will never be emailed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMemo(() => (form ? buildEmail(form, SAMPLE_LEAD, "INITIAL") : null), [form]);
  const followUpPreview = useMemo(() => (form ? buildEmail(form, SAMPLE_LEAD, "FOLLOW_UP") : null), [form]);

  if (!form) return null;

  const set = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const providerReady = Boolean(status?.configured && status?.verified);
  const canGoLive = providerReady && isValidEmail(form.from_email);

  return (
    <section className="panel mt-8 p-6" id="email-outreach">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Email outreach</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={
              providerReady
                ? "border-gold/50 bg-gold-soft text-gold-foreground"
                : "border-border bg-muted text-muted-foreground"
            }
          >
            Provider {status?.configured ? (status.verified ? "connected" : "key rejected") : "not connected"}
          </Badge>
          <Badge
            variant="outline"
            className={
              form.live_enabled
                ? "border-success/40 bg-success/15 text-success"
                : "border-border bg-muted text-muted-foreground"
            }
          >
            Live sending {form.live_enabled ? "ON" : "OFF"}
          </Badge>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{status?.message ?? "Checking email provider…"}</p>
      {!status?.configured ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Add your Resend API key privately in <span className="font-medium text-foreground">Project Settings → Secrets</span>{" "}
          as <code className="rounded bg-muted px-1.5 py-0.5 text-xs">RESEND_API_KEY</code>, then verify your sending
          domain inside Resend. The key stays server-side and is never sent to the browser.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="from_name">From name</Label>
          <Input id="from_name" value={form.from_name} onChange={(e) => set("from_name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from_email">From email (must use a verified domain)</Label>
          <Input
            id="from_email"
            value={form.from_email}
            placeholder="hello@yourdomain.com"
            onChange={(e) => set("from_email", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reply_to">Reply-to</Label>
          <Input id="reply_to" value={form.reply_to} onChange={(e) => set("reply_to", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Sending timezone (IANA)</Label>
          <Input id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="daily_cap">Daily cap</Label>
            <Input
              id="daily_cap"
              type="number"
              min={1}
              value={form.daily_cap}
              onChange={(e) => set("daily_cap", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start_hour">Start hour</Label>
            <Input
              id="start_hour"
              type="number"
              min={0}
              max={23}
              value={form.send_start_hour}
              onChange={(e) => set("send_start_hour", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end_hour">End hour</Label>
            <Input
              id="end_hour"
              type="number"
              min={0}
              max={23}
              value={form.send_end_hour}
              onChange={(e) => set("send_end_hour", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="delay">Follow-up delay (days)</Label>
            <Input
              id="delay"
              type="number"
              min={1}
              value={form.follow_up_delay_days}
              onChange={(e) => set("follow_up_delay_days", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max_follow">Max follow-ups</Label>
            <Input
              id="max_follow"
              type="number"
              min={0}
              value={form.max_follow_ups}
              onChange={(e) => set("max_follow_ups", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-display text-base font-semibold">Templates</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Variables: {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join("  ")}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="initial_subject">Initial subject</Label>
              <Input
                id="initial_subject"
                value={form.initial_subject}
                onChange={(e) => set("initial_subject", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="initial_body">Initial body</Label>
              <Textarea
                id="initial_body"
                rows={9}
                value={form.initial_body}
                onChange={(e) => set("initial_body", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="follow_up_subject">Follow-up subject</Label>
              <Input
                id="follow_up_subject"
                value={form.follow_up_subject}
                onChange={(e) => set("follow_up_subject", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="follow_up_body">Follow-up body</Label>
              <Textarea
                id="follow_up_body"
                rows={9}
                value={form.follow_up_body}
                onChange={(e) => set("follow_up_body", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[preview, followUpPreview].map((p, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {i === 0 ? "Initial preview" : "Follow-up preview"} — sample lead
              </p>
              <p className="mt-2 text-sm font-semibold">{p?.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p?.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90" onClick={() => save.mutate(form)}>
          {save.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null} Save email settings
        </Button>
      </div>

      <div className="mt-8 rounded-2xl border border-warning/40 bg-warning/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 text-gold-foreground" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Enable live email outreach</p>
            <p className="mt-1 text-sm text-muted-foreground">
              While this is off, every outreach control stays simulation-only and no message leaves the app. Turning it
              on allows real emails to be sent to real leads, one at a time, from the Automation page.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Switch
                id="live_enabled"
                checked={form.live_enabled}
                disabled={!canGoLive && !form.live_enabled}
                onCheckedChange={(checked) => {
                  if (checked && !window.confirm("Enable LIVE email sending? Real emails will be sent to real leads.")) return;
                  const next = { ...form, live_enabled: checked };
                  setForm(next);
                  save.mutate(next);
                }}
              />
              <Label htmlFor="live_enabled" className="text-sm">
                {form.live_enabled ? "Live sending enabled" : "Live sending disabled (safe mode)"}
              </Label>
            </div>
            {!canGoLive && !form.live_enabled ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Connect a verified provider and set a valid From email to unlock this.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <h3 className="font-display text-base font-semibold">Send a test email</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Goes only to the address you type here. Leads are never contacted by this action.
          </p>
          <div className="mt-3 flex gap-2">
            <Input placeholder="you@yourdomain.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <Button
              variant="outline"
              className="rounded-full border-gold/40"
              disabled={!isValidEmail(testTo) || test.isPending}
              onClick={() => test.mutate()}
            >
              <Send className="mr-1 size-3.5" /> Test
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border p-4">
          <h3 className="font-display text-base font-semibold">Suppression list</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Unsubscribes land here automatically. Suppressed addresses can never be emailed.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="address@example.com"
              value={suppressTarget}
              onChange={(e) => setSuppressTarget(e.target.value)}
            />
            <Button
              variant="outline"
              className="rounded-full border-gold/40"
              disabled={!isValidEmail(suppressTarget) || suppress.isPending}
              onClick={() => suppress.mutate()}
            >
              <ShieldOff className="mr-1 size-3.5" /> Suppress
            </Button>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {suppressions.length === 0 ? <li>No suppressed addresses.</li> : null}
            {suppressions.map((s) => (
              <li key={s.id}>
                {s.email} — {s.reason} · {formatDateTime(s.created_at)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border p-4">
        <h3 className="font-display text-base font-semibold">Recent email activity</h3>
        {sends.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No emails have been sent yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2">When</th>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Message ID</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-t border-border/70">
                    <td className="py-2 pr-3">{formatDateTime(s.created_at)}</td>
                    <td className="pr-3">{s.to_email}</td>
                    <td className="pr-3">{s.subject}</td>
                    <td className="pr-3">{s.kind}</td>
                    <td className="pr-3">{s.attempt_no}</td>
                    <td className="pr-3">
                      <span className={s.status === "SENT" ? "text-success" : "text-destructive"}>{s.status}</span>
                      {s.error ? <span className="block text-muted-foreground">{s.error}</span> : null}
                    </td>
                    <td className="pr-3">
                      {s.provider_message_id ? (
                        delivery[s.provider_message_id] ? (
                          <span className="capitalize">{delivery[s.provider_message_id]}</span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px]"
                            disabled={checkDelivery.isPending}
                            onClick={() => checkDelivery.mutate(s.provider_message_id!)}
                          >
                            Check
                          </Button>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-muted-foreground">{s.provider_message_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
