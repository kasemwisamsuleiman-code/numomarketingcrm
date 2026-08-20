/**
 * Server-only lead generation pipeline.
 *
 * Stage 1 — Sourcing: Apify Google Maps scraping when APIFY_API_TOKEN is set,
 *           otherwise an AI-drafted candidate list (same output shape), so the
 *           app works today and swaps to real scraping the moment the key exists.
 * Stage 2 — AI qualification: filters chains/bad fits, favours small &
 *           family-owned businesses, scores, writes a <30 word opening line and
 *           recommends SMS / EMAIL / CALL.
 */

export type RawCandidate = {
  business_name: string;
  category?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  business_hours?: string | null;
  rating?: number | null;
  reviews?: number | null;
};

export type QualifiedLead = {
  business_name: string;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  business_hours: string | null;
  personalized_line: string;
  lead_score: number;
  outreach_channel: "SMS" | "EMAIL" | "CALL";
  notes: string | null;
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAi(system: string, user: string, tool: { name: string; description: string; parameters: unknown }) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace.");
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
  if (!res.ok) throw new Error(`AI request failed (${res.status})`);
  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned an unexpected response.");
  return JSON.parse(args) as Record<string, unknown>;
}

export function hasApify() {
  return Boolean(process.env["APIFY_API_TOKEN"]);
}

/** Stage 1a — real Google Maps scraping through Apify. */
export async function scrapeWithApify(category: string, location: string, count: number): Promise<RawCandidate[]> {
  const token = process.env["APIFY_API_TOKEN"]!;
  const res = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [`${category} in ${location}`],
        maxCrawledPlacesPerSearch: count,
        language: "en",
        scrapeContacts: true,
      }),
    },
  );
  if (!res.ok) throw new Error(`Apify scrape failed (${res.status})`);
  const items = (await res.json()) as Array<Record<string, any>>;
  return items.map((i) => ({
    business_name: String(i["title"] ?? "").trim(),
    category: i["categoryName"] ?? category,
    location: i["address"] ?? location,
    phone: i["phone"] ?? null,
    email: Array.isArray(i["emails"]) ? (i["emails"][0] ?? null) : null,
    website: i["website"] ?? null,
    business_hours: Array.isArray(i["openingHours"])
      ? i["openingHours"].map((h: any) => `${h.day}: ${h.hours}`).join(", ")
      : null,
    rating: i["totalScore"] ?? null,
    reviews: i["reviewsCount"] ?? null,
  })).filter((c) => c.business_name.length > 0);
}

/** Stage 1b — AI-drafted candidate list used while Apify is not connected. */
export async function draftCandidates(category: string, location: string, count: number): Promise<RawCandidate[]> {
  const out = await callAi(
    "You build prospecting lists of small, independent, family-owned local businesses for a marketing agency. Never invent national chains or franchises.",
    `List ${count} plausible independent ${category} businesses in ${location}. Use realistic local naming conventions, neighbourhoods and phone formats for that area. Mark contact details you are unsure about as null rather than guessing exact emails.`,
    {
      name: "return_candidates",
      description: "Return sourced business candidates",
      parameters: {
        type: "object",
        properties: {
          candidates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                business_name: { type: "string" },
                category: { type: "string" },
                location: { type: "string" },
                phone: { type: "string" },
                email: { type: "string" },
                website: { type: "string" },
                business_hours: { type: "string" },
                rating: { type: "number" },
                reviews: { type: "number" },
              },
              required: ["business_name"],
            },
          },
        },
        required: ["candidates"],
      },
    },
  );
  const list = (out["candidates"] as RawCandidate[] | undefined) ?? [];
  return list.filter((c) => c && typeof c.business_name === "string" && c.business_name.trim().length > 0);
}

/** Stage 2 — qualification, scoring, personalization and channel recommendation. */
export async function qualifyCandidates(
  candidates: RawCandidate[],
  category: string,
  location: string,
): Promise<{ qualified: QualifiedLead[]; rejected: number }> {
  if (candidates.length === 0) return { qualified: [], rejected: 0 };
  const out = await callAi(
    "You qualify outbound leads for Numo Marketing, a small agency selling websites, local SEO and reactivation campaigns to small local businesses. Reject national chains, franchises, big-box retailers and businesses that clearly do not need marketing help. Favour small, family-owned, owner-operated businesses.",
    `Target search: ${category} in ${location}.\n\nQualify these candidates. For each KEPT lead return a lead_score 0-100 (fit + reachability + likely need), a personalized_line that is a natural, human, non-salesy opening under 30 words referencing something specific about the business, and outreach_channel: SMS if only a mobile-style phone exists, EMAIL if an email exists, CALL otherwise. Never invent partial or placeholder contact details — omit a phone/email entirely if you do not have the full real value. Put a one-line qualification rationale in notes. Drop chains and poor fits entirely.\n\nCandidates JSON:\n${JSON.stringify(candidates).slice(0, 60000)}`,
    {
      name: "return_qualified",
      description: "Return qualified leads",
      parameters: {
        type: "object",
        properties: {
          leads: {
            type: "array",
            items: {
              type: "object",
              properties: {
                business_name: { type: "string" },
                category: { type: "string" },
                location: { type: "string" },
                phone: { type: "string" },
                email: { type: "string" },
                website: { type: "string" },
                business_hours: { type: "string" },
                personalized_line: { type: "string" },
                lead_score: { type: "number" },
                outreach_channel: { type: "string", enum: ["SMS", "EMAIL", "CALL"] },
                notes: { type: "string" },
              },
              required: ["business_name", "personalized_line", "lead_score", "outreach_channel"],
            },
          },
        },
        required: ["leads"],
      },
    },
  );

  const raw = (out["leads"] as Array<Record<string, unknown>> | undefined) ?? [];
  const seen = new Set<string>();
  const qualified: QualifiedLead[] = [];
  for (const l of raw) {
    const name = String(l["business_name"] ?? "").trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const line = trimWords(String(l["personalized_line"] ?? ""), 30);
    const channel = String(l["outreach_channel"] ?? "EMAIL").toUpperCase();
    qualified.push({
      business_name: name,
      category: str(l["category"]) ?? category,
      location: str(l["location"]) ?? location,
      phone: cleanPhone(str(l["phone"])),
      email: cleanEmail(str(l["email"])),
      website: str(l["website"]),
      business_hours: str(l["business_hours"]),
      personalized_line: line,
      lead_score: clampScore(Number(l["lead_score"])),
      outreach_channel: channel === "SMS" || channel === "CALL" ? (channel as "SMS" | "CALL") : "EMAIL",
      notes: str(l["notes"]),
    });
  }
  return { qualified, rejected: Math.max(0, candidates.length - qualified.length) };
}

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function str(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : null;
}

/** Reject partial/placeholder phone numbers such as "905-528-null". */
function cleanPhone(value: string | null) {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.includes("null") || lower.includes("x") || lower.includes("?")) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (/^(\d)\1+$/.test(digits)) return null;
  return value.trim();
}

function cleanEmail(value: string | null) {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return null;
  if (email.includes("null") || email.includes("example.com")) return null;
  return email;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function trimWords(value: string, max: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(" ") : `${words.slice(0, max).join(" ")}`;
}
