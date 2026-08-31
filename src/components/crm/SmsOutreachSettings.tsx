import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/crm";

/**
 * SMS outreach is intentionally disabled at the product level: there is no
 * sender wired up, and no bulk-send path exists. This panel shows the
 * compliance state (recorded consent + STOP suppressions) that any future
 * provider connection must respect.
 */
export function SmsOutreachSettings() {
  const { data: consented = [] } = useQuery({
    queryKey: ["sms-consented"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, business_name, phone, sms_consent_source, sms_consent_at")
        .eq("sms_consent", true)
        .order("sms_consent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: stops = [] } = useQuery({
    queryKey: ["sms-suppressions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_suppressions")
        .select("id, phone, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <section className="panel mt-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">SMS outreach (disabled)</h2>
        </div>
        <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
          Sending disabled
        </Badge>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        SMS is off by default and no bulk cold-SMS sender exists in this CRM. A lead can only ever be queued for SMS
        once a compliant consent basis is recorded against it (Automation → per-lead “Record SMS consent”). Anyone who
        replies STOP is added to the suppression list below and is permanently excluded from every channel.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <h3 className="font-display text-base font-semibold">Leads with recorded consent</h3>
          {consented.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No leads have an SMS consent basis recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {consented.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="font-medium">{l.business_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.sms_consent_source ?? "—"} · {formatDateTime(l.sms_consent_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <ShieldAlert className="size-4 text-destructive" /> STOP / opt-out list
          </h3>
          {stops.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No numbers have opted out.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {stops.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="font-medium">{s.phone}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.reason} · {formatDateTime(s.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        To enable SMS later, connect a compliant provider (e.g. Twilio) via a server-side secret — the CRM will still
        require per-lead consent and honour this suppression list.
      </p>
    </section>
  );
}
