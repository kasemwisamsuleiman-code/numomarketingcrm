import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Target,
  Sparkles,
  CalendarDays,
  Users,
  FileText,
  Settings,
  Zap,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/generator", label: "Lead Generator", icon: Sparkles },
  { to: "/leads", label: "Lead Tracker", icon: Target },
  { to: "/automation", label: "Automation", icon: Zap },
  { to: "/meetings", label: "Meetings", icon: CalendarDays },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 lg:py-6">
        <header className="ink-panel px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-gold font-display text-lg font-bold text-gold-foreground">
                N
              </span>
              <span className="leading-tight">
                <span className="block font-display text-base font-semibold tracking-tight">NUMO</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-muted">
                  Marketing
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="rounded-full px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-gold/10 hover:text-ink-foreground"
                  activeProps={{ className: "bg-gold text-gold-foreground hover:bg-gold hover:text-gold-foreground" }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-medium text-ink-foreground">{user?.email ?? "Signed out"}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-ink-muted">Agency workspace</p>
              </div>
              <button
                onClick={signOut}
                aria-label="Sign out"
                className="flex size-9 items-center justify-center rounded-xl border border-gold/25 text-ink-muted transition-colors hover:bg-gold/15 hover:text-ink-foreground"
              >
                <LogOut className="size-4" />
              </button>
              <button
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="flex size-9 items-center justify-center rounded-xl border border-gold/25 text-ink-foreground lg:hidden"
              >
                {open ? <X className="size-4" /> : <Menu className="size-4" />}
              </button>
            </div>
          </div>

          {open ? (
            <nav className="mt-3 grid gap-1 border-t border-gold/15 pt-3 lg:hidden">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-muted"
                  activeProps={{ className: "bg-gold/15 text-ink-foreground" }}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title text-foreground">{title}</h1>
            {subtitle ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>

        <main className="mt-6 pb-16">{children}</main>
      </div>
    </div>
  );
}

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("panel overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}

export function GoldButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={cn(
        "rounded-full bg-ink px-5 text-ink-foreground shadow-soft hover:bg-ink/90",
        props.className,
      )}
    />
  );
}
