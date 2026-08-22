/**
 * Server-only OpenAI adapter (Option B: the workspace's own OpenAI key).
 *
 * The key is read from process.env["OPENAI_API_KEY"] inside the call, never at
 * module scope, and this module is server-only (*.server.ts is blocked from the
 * client bundle). Nothing here is wired into production lead generation yet —
 * the pipeline still runs on the existing Lovable AI + Apify path.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/** Default model used once/if lead generation is switched to direct OpenAI. */
export const OPENAI_MODEL = "gpt-4o-mini";

/** True when a server-side OpenAI credential is configured. Never returns the value. */
export function hasOpenAi() {
  return Boolean(process.env["OPENAI_API_KEY"]);
}

/**
 * Tool-calling chat completion against OpenAI, mirroring the shape of the
 * existing Lovable AI helper so the lead pipeline can swap providers later
 * with no change to prompts or parsing.
 */
export async function callOpenAi(
  system: string,
  user: string,
  tool: { name: string; description: string; parameters: unknown },
  model: string = OPENAI_MODEL,
): Promise<Record<string, unknown>> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("OpenAI is not configured. Add OPENAI_API_KEY in Project Settings → Secrets.");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });

  // Never log the response body verbatim on auth errors — it can echo request headers.
  if (res.status === 401) throw new Error("OpenAI rejected the configured key.");
  if (res.status === 429) throw new Error("OpenAI rate limit reached — try again in a minute.");
  if (res.status === 402 || res.status === 403) throw new Error("OpenAI quota or access is unavailable for this key.");
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("OpenAI returned an unexpected response.");
  return JSON.parse(args) as Record<string, unknown>;
}

/**
 * Zero-cost readiness probe: lists models (a free endpoint) to confirm the key
 * works. Returns only a boolean + status, never the key or account details.
 */
export async function verifyOpenAiKey(): Promise<{ ok: boolean; status: number }> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) return { ok: false, status: 0 };
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  return { ok: res.ok, status: res.status };
}
