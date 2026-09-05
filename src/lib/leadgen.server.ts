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

export type AiProvider = "OPENAI" | "LOVABLE AI";

/** Production AI provider: the workspace's own OpenAI key when configured. */
export function aiProvider(): AiProvider | null {
  if (process.env["OPENAI_API_KEY"]) return "OPENAI";
  if (process.env["LOVABLE_API_KEY"]) return "LOVABLE AI";
  return null;
}

async function callLovableAi(
  system: string,
  user: string,
  tool: { name: string; description: string; parameters: unknown },
) {
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

/**
 * Production AI call. Routes to the user's own OpenAI key when present,
 * otherwise the Lovable AI gateway. Never logs or returns the key.
 */
async function callAi(system: string, user: string, tool: { name: string; description: string; parameters: unknown }) {
  if (process.env["OPENAI_API_KEY"]) {
    const { callOpenAi } = await import("./openai.server");
    return callOpenAi(system, user, tool);
  }
  return callLovableAi(system, user, tool);
}


/** True when a server-side Apify credential exists (direct token or Lovable connector). */
export function hasApify() {
  return Boolean(process.env["APIFY_API_TOKEN"]) || Boolean(process.env["APIFY_API_KEY"] && process.env["LOVABLE_API_KEY"]);
}

const APIFY_ACTOR = "compass~crawler-google-places";

/** Base URL + auth headers for Apify, via direct token or the Lovable connector gateway. */
function apifyRequestConfig() {
  const token = process.env["APIFY_API_TOKEN"];
  const connectionKey = process.env["APIFY_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
    return { base: "https://api.apify.com/v2", headers };
  }
  if (connectionKey && lovableKey) {
    headers["authorization"] = `Bearer ${lovableKey}`;
    headers["x-connection-api-key"] = connectionKey;
    return { base: "https://connector-gateway.lovable.dev/apify", headers };
  }
  throw new Error("Apify is not connected for this workspace.");
}

const WAIT_SECONDS = 50; // stay under the 60s gateway/proxy request limit
const MAX_WAIT_MS = 5 * 60 * 1000;

export type ApifyRunState = {
  runId: string;
  datasetId: string | null;
  status: string;
};

function parseApifyRun(json: unknown): ApifyRunState {
  const data = (json as { data?: Record<string, unknown> })?.data;
  const runId = String(data?.["id"] ?? "");
  if (!runId) throw new Error("Apify did not return a run id.");
  return {
    runId,
    datasetId: data?.["defaultDatasetId"] ? String(data["defaultDatasetId"]) : null,
    status: String(data?.["status"] ?? "UNKNOWN"),
  };
}

/** Starts a crawl and returns immediately so the app request never waits on Apify. */
export async function startApifyRun(category: string, location: string, count: number): Promise<ApifyRunState> {
  const { base, headers } = apifyRequestConfig();
  const response = await fetch(`${base}/acts/${APIFY_ACTOR}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      searchStringsArray: [category],
      locationQuery: location,
      maxCrawledPlacesPerSearch: count,
      language: "en",
      scrapeContacts: true,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Apify run start failed [${response.status}]: ${body.slice(0, 500)}`);
    throw new Error(`Apify could not start (${response.status}).`);
  }
  return parseApifyRun(await response.json());
}

/** One non-blocking provider status check; the browser performs later polls. */
export async function getApifyRun(runId: string): Promise<ApifyRunState> {
  const { base, headers } = apifyRequestConfig();
  const response = await fetch(`${base}/actor-runs/${encodeURIComponent(runId)}`, { headers });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Apify run status failed [${response.status}]: ${body.slice(0, 500)}`);
    throw new Error(`Could not check Apify progress (${response.status}).`);
  }
  return parseApifyRun(await response.json());
}

export async function getApifyDataset(datasetId: string, count: number, category: string, location: string) {
  const { base, headers } = apifyRequestConfig();
  const response = await fetch(
    `${base}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${Math.max(1, count)}`,
    { headers },
  );
  if (!response.ok) {
    const body = await response.text();
    console.error(`Apify dataset fetch failed [${response.status}]: ${body.slice(0, 500)}`);
    throw new Error(`Could not retrieve Apify results (${response.status}).`);
  }
  const items = (await response.json()) as Array<Record<string, any>>;
  return mapApifyItems(items, category, location);
}

function mapApifyItems(items: Array<Record<string, any>>, category: string, location: string): RawCandidate[] {
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
  })).filter((candidate) => candidate.business_name.length > 0);
}

/**
 * Stage 1a — real Google Maps scraping through Apify (secret stays server-side).
 * Uses the ASYNC run API and polls: the synchronous endpoint keeps one HTTP
 * request open for the whole crawl, which the connector gateway kills at 60s
 * with a 502 for anything larger than a couple of places.
 */
export async function scrapeWithApify(category: string, location: string, count: number): Promise<RawCandidate[]> {
  const { base, headers } = apifyRequestConfig();

  const startRes = await fetch(`${base}/acts/${APIFY_ACTOR}/runs?waitForFinish=${WAIT_SECONDS}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      // Constrain the crawl geographically instead of relying on the free-text
      // search string alone — otherwise Google Maps can return out-of-region places.
      searchStringsArray: [category],
      locationQuery: location,
      maxCrawledPlacesPerSearch: count,
      language: "en",
      scrapeContacts: true,
    }),
  });

  if (!startRes.ok) {
    const body = await startRes.text();
    console.error(`Apify run start failed [${startRes.status}]: ${body.slice(0, 500)}`);
    throw new Error(`Apify scrape failed (${startRes.status})`);
  }

  let run = ((await startRes.json()) as { data?: Record<string, any> }).data;
  const runId = run?.["id"];
  if (!runId) throw new Error("Apify did not return a run id.");

  const deadline = Date.now() + MAX_WAIT_MS;
  while (run && ["READY", "RUNNING"].includes(String(run["status"])) && Date.now() < deadline) {
    const pollRes = await fetch(`${base}/actor-runs/${runId}?waitForFinish=${WAIT_SECONDS}`, { headers });
    if (!pollRes.ok) {
      const body = await pollRes.text();
      console.error(`Apify run poll failed [${pollRes.status}]: ${body.slice(0, 500)}`);
      throw new Error(`Apify scrape failed (${pollRes.status})`);
    }
    run = ((await pollRes.json()) as { data?: Record<string, any> }).data;
  }

  const status = String(run?.["status"] ?? "UNKNOWN");
  const datasetId = run?.["defaultDatasetId"];
  if (status !== "SUCCEEDED" && status !== "TIMING-OUT") {
    if (status === "READY" || status === "RUNNING") throw new Error("Apify scrape timed out — try a smaller batch.");
    throw new Error(`Apify scrape did not complete (${status}).`);
  }
  if (!datasetId) throw new Error("Apify returned no dataset for this run.");

  const itemsRes = await fetch(`${base}/datasets/${datasetId}/items?clean=true&limit=${Math.max(1, count)}`, { headers });
  if (!itemsRes.ok) {
    const body = await itemsRes.text();
    console.error(`Apify dataset fetch failed [${itemsRes.status}]: ${body.slice(0, 500)}`);
    throw new Error(`Apify scrape failed (${itemsRes.status})`);
  }
  const items = (await itemsRes.json()) as Array<Record<string, any>>;
  return mapApifyItems(items, category, location);
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

/** US state name <-> USPS abbreviation, used for defensive region checking. */
const US_STATES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co",
  connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id",
  illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la",
  maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn",
  mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd",
  tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt", virginia: "va", washington: "wa",
  "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "district of columbia": "dc",
};

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Defensive region check: true when the candidate address plausibly sits inside the
 * requested location. Returns true when we cannot tell (no address / unknown region)
 * so we never silently discard valid data — only clearly out-of-region rows are cut.
 */
export function matchesLocation(candidateLocation: string | null | undefined, requested: string) {
  const addr = (candidateLocation ?? "").toLowerCase().trim();
  if (!addr) return true;

  const parts = requested
    .toLowerCase()
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    // Region term: match either the full state name or its abbreviation as a word.
    const abbr = US_STATES[part];
    const nameFromAbbr = Object.keys(US_STATES).find((k) => US_STATES[k] === part);
    const variants = [part, abbr, nameFromAbbr].filter(Boolean) as string[];
    if (variants.some((v) => new RegExp(`(^|[^a-z])${v.replace(/\s+/g, "\\s+")}([^a-z]|$)`, "i").test(addr))) {
      return true;
    }
  }

  // If the requested location names a US state and the address names a *different*
  // US state, it is clearly out of region.
  const requestedStates = parts.filter((p) => p in US_STATES || Object.values(US_STATES).includes(p));
  if (requestedStates.length > 0) {
    const addrTokens = tokens(addr);
    const addrStates = new Set<string>();
    for (const t of addrTokens) {
      if (t in US_STATES) addrStates.add(US_STATES[t]!);
      else if (Object.values(US_STATES).includes(t)) addrStates.add(t);
    }
    // multi-word state names
    for (const name of Object.keys(US_STATES)) {
      if (name.includes(" ") && addr.includes(name)) addrStates.add(US_STATES[name]!);
    }
    const wanted = new Set(requestedStates.map((p) => (p in US_STATES ? US_STATES[p]! : p)));
    if (addrStates.size > 0 && ![...addrStates].some((s) => wanted.has(s))) return false;
    // Address has a recognizable US shape but no state we could read -> allow.
    return addrStates.size === 0;
  }

  // Non-state (city/region/country) request: require a token overlap with the address.
  const requestedTokens = tokens(requested).filter((t) => t.length > 2);
  if (requestedTokens.length === 0) return true;
  const addrText = ` ${tokens(addr).join(" ")} `;
  return requestedTokens.some((t) => addrText.includes(` ${t} `));
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

/* ------------------------------------------------------------------ *
 * Parallel qualification / enrichment
 * ------------------------------------------------------------------ */

import { chunk as chunkList, mapPool } from "./concurrency";

/** Stable cache key for a business, so it is never enriched twice. */
export function enrichmentCacheKey(candidate: {
  business_name?: string | null;
  location?: string | null;
  phone?: string | null;
  website?: string | null;
}) {
  const phone = (candidate.phone ?? "").replace(/\D/g, "").slice(-10);
  if (phone.length === 10) return `p:${phone}`;
  const host = (candidate.website ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  if (host) return `w:${host}`;
  return `n:${normalizeName(candidate.business_name ?? "")}|${normalizeName(candidate.location ?? "").slice(0, 40)}`;
}

/** Fields we still need the AI to work on for this candidate. */
function missingFields(candidate: RawCandidate) {
  const missing: string[] = [];
  if (!cleanPhone(candidate.phone ?? null)) missing.push("phone");
  if (!cleanEmail(candidate.email ?? null)) missing.push("email");
  if (!candidate.website) missing.push("website");
  if (!candidate.business_hours) missing.push("business_hours");
  return missing;
}

const QUALIFY_SYSTEM =
  "You qualify outbound leads for Numo Marketing, a small agency selling websites, local SEO and reactivation campaigns to small local businesses. Reject national chains, franchises, big-box retailers and businesses that clearly do not need marketing help. Favour small, family-owned, owner-operated businesses.";

const QUALIFY_TOOL = {
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
};

/**
 * Qualifies ONE small group of candidates. Scraped contact details are treated
 * as verified truth: the AI is only asked to fill genuinely missing fields, and
 * its answers can never overwrite a scraped phone/email/website.
 */
async function qualifyChunk(
  candidates: RawCandidate[],
  category: string,
  location: string,
): Promise<QualifiedLead[]> {
  const payload = candidates.map((c) => ({ ...c, missing_fields: missingFields(c) }));
  const out = await callAi(
    QUALIFY_SYSTEM,
    `Target search: ${category} in ${location}.\n\nQualify these candidates. For each KEPT lead return a lead_score 0-100 (fit + reachability + likely need), a personalized_line that is a natural, human, non-salesy opening under 30 words referencing something specific about the business, and outreach_channel: SMS if only a mobile-style phone exists, EMAIL if an email exists, CALL otherwise. Only supply contact details listed in that candidate's missing_fields, and only when you are confident they are real and complete — otherwise omit them. Never invent partial or placeholder details. Put a one-line qualification rationale in notes. Drop chains and poor fits entirely.\n\nCandidates JSON:\n${JSON.stringify(payload).slice(0, 60000)}`,
    QUALIFY_TOOL,
  );

  const raw = (out["leads"] as Array<Record<string, unknown>> | undefined) ?? [];
  const bySource = new Map(candidates.map((c) => [normalizeName(c.business_name), c] as const));
  const seen = new Set<string>();
  const qualified: QualifiedLead[] = [];

  for (const l of raw) {
    const name = String(l["business_name"] ?? "").trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const source = bySource.get(key);

    const line = trimWords(String(l["personalized_line"] ?? ""), 30);
    // Low-confidence guard: no usable opener means we do not keep the lead.
    if (line.split(/\s+/).filter(Boolean).length < 4) continue;

    // Verified scraped values always win; AI only fills the gaps.
    const phone = cleanPhone(str(source?.phone ?? null)) ?? cleanPhone(str(l["phone"]));
    const email = cleanEmail(str(source?.email ?? null)) ?? cleanEmail(str(l["email"]));
    const website = str(source?.website ?? null) ?? str(l["website"]);
    const hours = str(source?.business_hours ?? null) ?? str(l["business_hours"]);

    // Reject unreachable leads — no channel means no outreach value.
    if (!phone && !email && !website) continue;

    const channel = String(l["outreach_channel"] ?? "").toUpperCase();
    const resolvedChannel: "SMS" | "EMAIL" | "CALL" = email
      ? channel === "SMS" || channel === "CALL"
        ? (channel as "SMS" | "CALL")
        : "EMAIL"
      : phone
        ? channel === "SMS"
          ? "SMS"
          : "CALL"
        : "EMAIL";

    qualified.push({
      business_name: name,
      category: str(source?.category ?? null) ?? str(l["category"]) ?? category,
      location: str(source?.location ?? null) ?? str(l["location"]) ?? location,
      phone,
      email,
      website,
      business_hours: hours,
      personalized_line: line,
      lead_score: clampScore(Number(l["lead_score"])),
      outreach_channel: resolvedChannel,
      notes: str(l["notes"]),
    });
  }
  return qualified;
}

export type ParallelQualifyResult = {
  qualified: QualifiedLead[];
  rejected: number;
  failures: number;
  concurrency: number;
};

/**
 * Enriches many candidates at once instead of in one giant sequential call.
 * Small groups run through an adaptive pool (scales up while the provider is
 * happy, halves on a rate limit) and each finished group is handed straight to
 * `onBatch` so leads can be saved and shown while the rest is still running.
 */
export async function qualifyCandidatesParallel(
  candidates: RawCandidate[],
  category: string,
  location: string,
  options: {
    groupSize?: number;
    concurrency?: number;
    maxConcurrency?: number;
    onBatch?: (leads: QualifiedLead[]) => Promise<void> | void;
  } = {},
): Promise<ParallelQualifyResult> {
  if (candidates.length === 0) return { qualified: [], rejected: 0, failures: 0, concurrency: 0 };

  const groups = chunkList(candidates, options.groupSize ?? 5);
  const all: QualifiedLead[] = [];

  const pool = await mapPool(
    groups,
    async (group) => {
      const leads = await qualifyChunk(group, category, location);
      all.push(...leads);
      if (options.onBatch) await options.onBatch(leads);
      return leads.length;
    },
    {
      concurrency: options.concurrency ?? 10,
      maxConcurrency: options.maxConcurrency ?? 24,
      minConcurrency: 2,
      retries: 3,
    },
  );

  return {
    qualified: all,
    rejected: Math.max(0, candidates.length - all.length),
    failures: pool.failures.length,
    concurrency: pool.finalConcurrency,
  };
}
