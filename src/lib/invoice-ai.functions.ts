import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * AI writing assistance for the Invoice Generator.
 *
 * Scope guard: the model only ever returns TEXT (line-item descriptions, notes,
 * payment-term wording). It never sees or returns prices, quantities, tax,
 * discounts, totals, balances, dates, statuses or client identity — all of that
 * stays deterministic application code driven by explicit user input.
 */

export type InvoiceCopySuggestion = {
  descriptions: string[];
  notes: string;
  payment_terms: string;
  provider: "OPENAI";
};

export const getInvoiceAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { hasOpenAi } = await import("./openai.server");
    return { configured: hasOpenAi(), provider: "OpenAI" as const };
  });

const SYSTEM = [
  "You are a copywriting assistant for a marketing agency's invoices.",
  "You write concise, professional service descriptions only.",
  "STRICT RULES:",
  "- Never state or imply any price, rate, quantity, hours, tax, discount, total, balance, due date, payment status or currency amount.",
  "- Never invent client names, dates, deliverable counts or facts the user did not provide.",
  "- If a detail is missing, write generically instead of guessing.",
  "- Each line-item description is one clear sentence fragment, max 14 words, no numbers.",
  "- Notes: at most 2 short sentences. Payment terms: one short sentence of wording only (no amounts or specific dates unless the user supplied them verbatim).",
].join("\n");

const TOOL = {
  name: "invoice_copy",
  description: "Professional invoice wording suggestions. Text only, no financial figures.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      descriptions: {
        type: "array",
        description: "One polished description per distinct piece of work mentioned by the user.",
        items: { type: "string" },
      },
      notes: { type: "string", description: "Optional short invoice note. Empty string if not useful." },
      payment_terms: { type: "string", description: "Optional payment-term wording. Empty string if not useful." },
    },
    required: ["descriptions", "notes", "payment_terms"],
  },
};

/** Strips anything that looks like a financial figure the model shouldn't produce. */
function sanitize(text: string): string {
  return text
    .replace(/[$€£]\s?\d[\d,.]*/g, "")
    .replace(/\b\d+(\.\d+)?\s?%/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const draftInvoiceCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { details: string }) => {
    const details = String(input?.details ?? "").trim();
    if (details.length < 3) throw new Error("Add a few words about the work first.");
    if (details.length > 1500) throw new Error("Keep the work details under 1500 characters.");
    return { details };
  })
  .handler(async ({ data }): Promise<InvoiceCopySuggestion> => {
    const { callOpenAi, hasOpenAi } = await import("./openai.server");
    if (!hasOpenAi()) throw new Error("OpenAI is not connected, so AI writing help is unavailable.");

    const result = await callOpenAi(
      SYSTEM,
      `Rough work details from the user:\n${data.details}\n\nRewrite as invoice wording. Text only — no figures.`,
      TOOL,
    );

    const rawDescriptions = Array.isArray(result["descriptions"]) ? (result["descriptions"] as unknown[]) : [];
    const descriptions = rawDescriptions
      .map((d) => sanitize(String(d)))
      .filter((d) => d.length > 0)
      .slice(0, 8);

    if (descriptions.length === 0) throw new Error("The assistant could not draft wording from those details.");

    return {
      descriptions,
      notes: sanitize(String(result["notes"] ?? "")),
      payment_terms: sanitize(String(result["payment_terms"] ?? "")),
      provider: "OPENAI",
    };
  });
