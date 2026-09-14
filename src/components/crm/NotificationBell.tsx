import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  channel: string | null;
  type: string | null;
  title: string | null;
  body: string | null;
  contact: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_TONE: Record<string, string> = {
  REPLY: "bg-gold/20 text-gold-foreground border-gold/40",
  NEW_LEAD: "bg-success/15 text-success border-success/30",
  MEETING_REQUESTED: "bg-gold text-gold-foreground border-gold",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable */
  }
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (active && data) setItems(data as Notification[]);
      });

    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          setItems((prev) => [payload.new as Notification, ...prev].slice(0, 20));
          playChime();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const next = payload.new as Notification;
          setItems((prev) => prev.map((n) => (n.id === next.id ? next : n)));
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n) => !n.is_read).length;

  const openRow = async (n: Notification) => {
    setOpen(false);
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    if (n.lead_id) {
      navigate({ to: "/leads", search: { q: n.lead_name ?? "" } });
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex size-9 items-center justify-center rounded-xl border border-gold/25 text-ink-muted transition-colors hover:bg-gold/15 hover:text-ink-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold leading-[18px] text-gold-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-gold/20 bg-card shadow-soft sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-sm font-semibold">Notifications</p>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {unread} unread
            </span>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => void openRow(n)}
                  className={cn(
                    "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary/60",
                    !n.is_read && "bg-gold/10",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        TYPE_TONE[n.type ?? ""] ?? "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {(n.type ?? "").replace("_", " ") || "UPDATE"}
                    </span>
                    {n.channel ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {n.channel}
                      </span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  <p className="text-sm font-semibold">{n.lead_name ?? n.title ?? "Lead"}</p>
                  {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                  {n.contact ? <p className="text-[11px] text-muted-foreground/80">{n.contact}</p> : null}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-border p-2">
            <button
              onClick={() => void markAll()}
              className="w-full rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-gold/10 hover:text-ink-foreground"
            >
              Mark all as read
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
