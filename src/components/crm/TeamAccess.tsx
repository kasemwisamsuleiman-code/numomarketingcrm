import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

type Member = { id: string; email: string; note: string | null; created_at: string };

export function TeamAccess() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id,email,note,created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const clean = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address");
      const { error } = await supabase
        .from("team_members")
        .insert({ email: clean, note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Email approved. They can now sign up and sign in.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add email"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Access removed.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove email"),
  });

  return (
    <section className="panel mt-8 p-6">
      <h2 className="font-display text-lg font-semibold">Team access</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only the emails listed here can sign in and see Numo CRM data. Everyone approved shares the same
        workspace — leads, meetings, clients and invoices.
      </p>

      <form
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="team-email">Email address</Label>
          <Input
            id="team-email"
            type="email"
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="team-note">Note (optional)</Label>
          <Input
            id="team-note"
            placeholder="Sales assistant"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={add.isPending} className="rounded-full bg-ink text-ink-foreground hover:bg-ink/90">
          <UserPlus className="mr-2 size-4" /> Approve email
        </Button>
      </form>

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-ink text-ink-foreground">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em]">Email</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em]">Note</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em]">Access</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Loading team…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  No approved emails yet.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{m.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.note ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {m.email === user?.email?.toLowerCase() ? (
                      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">You</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => remove.mutate(m.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="mr-1 size-4" /> Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
