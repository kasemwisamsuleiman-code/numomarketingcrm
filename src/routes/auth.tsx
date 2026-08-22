import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Numo CRM" },
      { name: "description", content: "Sign in to the Numo Marketing CRM to manage leads, meetings, clients and invoices." },
      { property: "og:title", content: "Sign in — Numo CRM" },
      { property: "og:description", content: "Secure access to the Numo Marketing agency CRM workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

// Private team-only CRM: self-serve signup is disabled in the backend too.
// Flip to true only if public registration is ever intended.
const SIGNUPS_OPEN = false;

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. You're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="ink-panel px-8 py-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gold font-display text-xl font-bold text-gold-foreground">
            N
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink-foreground">NUMO MARKETING</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-ink-muted">Agency CRM</p>
        </div>

        <div className="panel mt-4 p-6">
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full rounded-full" onClick={google}>
            Continue with Google
          </Button>

          {SIGNUPS_OPEN ? (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New to Numo?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="font-semibold text-foreground underline underline-offset-4"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          ) : (
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Private workspace — accounts are created by the Numo administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
