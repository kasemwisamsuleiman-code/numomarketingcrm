import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { verifyAccessPassword } from "@/lib/gate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UNLOCK_KEY = "numo-unlocked";

export function RequireAuth({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === "1");
    setReady(true);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const result = await verifyAccessPassword({ data: { password } });
      if (result.ok) {
        sessionStorage.setItem(UNLOCK_KEY, "1");
        setUnlocked(true);
      } else {
        setError(true);
        setPassword("");
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Loading Numo CRM…</p>
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

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

        <form onSubmit={submit} className="panel mt-4 grid gap-4 p-6">
          <div className="grid gap-2">
            <Label htmlFor="access-password">Password</Label>
            <Input
              id="access-password"
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">Incorrect password.</p>}
          <Button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90"
          >
            {busy ? "Checking…" : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
