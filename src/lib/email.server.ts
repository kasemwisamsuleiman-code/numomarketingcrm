/**
 * Server-only email provider adapter (Resend via the Lovable connector gateway).
 *
 * Credentials are read from process.env inside each call, never at module scope,
 * and this file is server-only (*.server.ts is blocked from client bundles).
 * Nothing here is ever reachable from the browser.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/resend";

function creds() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["RESEND_API_KEY"];
  return { lovableKey, connectionKey };
}

function gatewayHeaders(lovableKey: string, connectionKey: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

/** True when a server-side Resend credential is configured. Never returns the value. */
export function hasResend() {
  const { lovableKey, connectionKey } = creds();
  return Boolean(lovableKey && connectionKey);
}

export type SendResult = { id: string };

export async function sendEmailViaResend(input: {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendResult> {
  const { lovableKey, connectionKey } = creds();
  if (!lovableKey || !connectionKey)
    throw new Error("Email provider is not connected. Link the Resend connector to this project.");

  const res = await fetch(`${GATEWAY}/emails`, {
    method: "POST",
    headers: gatewayHeaders(lovableKey, connectionKey),
    body: JSON.stringify({
      from: `${input.fromName} <${input.fromEmail}>`,
      to: [input.to],
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error(`[resend] send failed [${res.status}]: ${raw}`);
    let message = `Email provider rejected the send (${res.status}).`;
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string; name?: string };
      if (parsed.message) message = `${message} ${parsed.message}`;
      else if (parsed.error) message = `${message} ${parsed.error}`;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }

  const json = JSON.parse(raw) as { id?: string };
  if (!json.id) throw new Error("Email provider accepted the request but returned no message id.");
  return { id: json.id };
}

/** Zero-cost credential probe (lists domains) so status can be shown without sending. */
export async function verifyResendKey(): Promise<{ ok: boolean; status: number; domains: string[] }> {
  const { lovableKey, connectionKey } = creds();
  if (!lovableKey || !connectionKey) return { ok: false, status: 0, domains: [] };
  const res = await fetch(`${GATEWAY}/domains`, {
    headers: gatewayHeaders(lovableKey, connectionKey),
  });
  if (!res.ok) {
    console.error(`[resend] domains lookup failed [${res.status}]: ${await res.text()}`);
    return { ok: false, status: res.status, domains: [] };
  }
  const json = (await res.json()) as { data?: Array<{ name?: string; status?: string }> };
  const domains = (json.data ?? [])
    .filter((d) => (d.status ?? "").toLowerCase() === "verified")
    .map((d) => d.name ?? "")
    .filter(Boolean);
  return { ok: true, status: res.status, domains };
}


function secret() {
  return process.env["UNSUBSCRIBE_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "numo-unsubscribe";
}

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sign(payload: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

/** Signed, tamper-proof unsubscribe token bound to one owner + recipient. */
export async function makeUnsubscribeToken(userId: string, email: string) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ u: userId, e: email.toLowerCase() })));
  return `${payload}.${await sign(payload)}`;
}

export async function readUnsubscribeToken(token: string): Promise<{ userId: string; email: string } | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if ((await sign(payload)) !== signature) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { u?: string; e?: string };
    if (!json.u || !json.e) return null;
    return { userId: json.u, email: json.e };
  } catch {
    return null;
  }
}

/** Look up a single message's delivery outcome (delivered / bounced / complained / etc). */
export async function fetchEmailDelivery(
  messageId: string,
): Promise<{ ok: boolean; lastEvent: string; detail?: string }> {
  const { lovableKey, connectionKey } = creds();
  if (!lovableKey || !connectionKey) return { ok: false, lastEvent: "unknown", detail: "Email provider is not connected." };
  const res = await fetch(`${GATEWAY}/emails/${encodeURIComponent(messageId)}`, {
    headers: gatewayHeaders(lovableKey, connectionKey),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error(`[resend] status lookup failed [${res.status}]: ${raw}`);
    return { ok: false, lastEvent: "unknown", detail: `Provider returned ${res.status}: ${raw.slice(0, 300)}` };
  }
  const json = JSON.parse(raw) as { last_event?: string };
  return { ok: true, lastEvent: json.last_event ?? "unknown" };
}
