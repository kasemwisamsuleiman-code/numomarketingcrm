import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { draftInvoiceCopy, getInvoiceAiStatus, type InvoiceCopySuggestion } from "@/lib/invoice-ai.functions";

type Props = {
  /** Adds the accepted wording to the invoice as a line-item description. */
  onApplyDescription: (text: string) => void;
  onApplyNotes: (text: string) => void;
};

/**
 * AI writing assistance only. Suggestions are editable and never touch the
 * invoice until the user explicitly accepts them; nothing here changes prices,
 * quantities, tax, discounts, totals, dates, status or the client record.
 */
export function InvoiceAiAssist({ onApplyDescription, onApplyNotes }: Props) {
  const statusFn = useServerFn(getInvoiceAiStatus);
  const draftFn = useServerFn(draftInvoiceCopy);
  const [details, setDetails] = useState("");
  const [draft, setDraft] = useState<InvoiceCopySuggestion | null>(null);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: status } = useQuery({ queryKey: ["invoice-ai-status"], queryFn: () => statusFn() });

  const run = useMutation({
    mutationFn: () => draftFn({ data: { details } }),
    onSuccess: (res) => {
      setError(null);
      setDraft(res);
      setDescriptions(res.descriptions);
      setNotes(res.notes);
      setTerms(res.payment_terms);
    },
    onError: (e: Error) => {
      setDraft(null);
      setError(e.message || "The writing assistant is unavailable right now.");
    },
  });

  const configured = status?.configured ?? false;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="size-4 text-gold" /> AI writing assistant
        </p>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {configured ? "OpenAI · connected" : "OpenAI · not connected"}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Wording help only — it never sets prices, quantities, tax, totals, dates or client details. Review and accept
        each suggestion before it becomes invoice text.
      </p>

      <Textarea
        rows={3}
        className="mt-3"
        aria-label="Rough work details"
        placeholder="Rough notes, e.g. ran their google ads for a month, redid the landing page, weekly reporting call"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <Button
        variant="outline"
        className="mt-3 rounded-full"
        disabled={!configured || run.isPending || details.trim().length < 3}
        onClick={() => run.mutate()}
      >
        {run.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
        {run.isPending ? "Drafting…" : "Draft wording"}
      </Button>

      {!configured ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Connect an OpenAI key in the workspace secrets to enable writing help. Invoices work normally without it.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {draft ? (
        <div className="mt-4 grid gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">AI suggestion · editable</p>
          {descriptions.map((d, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
              <Textarea
                rows={2}
                aria-label={`Suggested description ${i + 1}`}
                value={d}
                onChange={(e) => setDescriptions(descriptions.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!d.trim()}
                onClick={() => {
                  onApplyDescription(d.trim());
                  toast.success("Added as a line item description");
                }}
              >
                <Check className="mr-1 size-4" /> Add line
              </Button>
            </div>
          ))}

          {notes || terms ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
              <Textarea
                rows={3}
                aria-label="Suggested notes and payment terms"
                value={[notes, terms].filter(Boolean).join("\n")}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setTerms("");
                }}
              />
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  onApplyNotes([notes, terms].filter(Boolean).join("\n").trim());
                  toast.success("Added to notes / payment terms");
                }}
              >
                <Check className="mr-1 size-4" /> Add to notes
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
