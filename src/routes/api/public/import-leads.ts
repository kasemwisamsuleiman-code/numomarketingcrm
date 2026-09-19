import { createFileRoute } from "@tanstack/react-router";

type AnyItem = Record<string, unknown>;

const MAX_ITEMS = 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Case-insensitive lookup of the first non-empty value among candidate keys. */
function pick(item: AnyItem, keys: string[]): string {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(item)) lower.set(k.toLowerCase(), v);
  for (const key of keys) {
    const raw = lower.get(key.toLowerCase());
    const value = firstString(raw);
    if (value) return value;
  }
  return "";
}

function firstString(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number") return String(raw);
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const value = firstString(entry);
      if (value) return value;
    }
  }
  return "";
}

/** Flatten opening hours (string, array or object) into one readable line. */
function formatHours(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim().replace(/\s*\n\s*/g, "; ").slice(0, 300);
  if (Array.isArray(raw)) {
    const parts = raw
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          const o = entry as AnyItem;
          const day = firstString(o["day"] ?? o["dayOfWeek"] ?? o["weekday"]);
          const hours = firstString(o["hours"] ?? o["time"] ?? o["value"] ?? o["opens"]);
          return [day, hours].filter(Boolean).join(": ");
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("; ").slice(0, 300);
  }
  if (typeof raw === "object") {
    return Object.entries(raw as AnyItem)
      .map(([day, value]) => `${day}: ${firstString(value)}`)
      .filter((s) => !s.endsWith(": "))
      .join("; ")
      .slice(0, 300);
  }
  return "";
}

function buildLocation(item: AnyItem): string {
  const direct = pick(item, ["full_address", "fullAddress", "address", "formatted_address", "street_address", "location"]);
  if (direct) return direct.slice(0, 200);
  const city = pick(item, ["city", "town", "locality"]);
  const state = pick(item, ["state", "region", "province", "administrative_area"]);
  return [city, state].filter(Boolean).join(", ").slice(0, 200);
}

function normPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function normDomain(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return cleaned || null;
}

function normEmail(value: string): string | null {
  const v = value.trim().toLowerCase();
  return v.includes("@") ? v : null;
}

/**
 * Secure ingestion endpoint for the Apify "Local Business Leads Scraper" actor.
 * Callers must present the server-only LEAD_IMPORT_SECRET; nothing is exposed
 * publicly and no outreach is ever triggered by an import.
 */
export const Route = createFileRoute("/api/public/import-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["LEAD_IMPORT_SECRET"];
        const provided = request.headers.get("x-import-secret") ?? "";
        if (!expected || provided.length !== expected.length || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const rawItems = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as AnyItem | null)?.["items"])
            ? ((payload as AnyItem)["items"] as unknown[])
            : null;
        if (!rawItems) return json({ error: "Body must be an array or { items: [...] }" }, 400);
        if (rawItems.length > MAX_ITEMS) return json({ error: `Maximum ${MAX_ITEMS} items per request` }, 400);

        const received = rawItems.length;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Owner account: the account that already owns CRM leads, else the first user.
        let ownerId: string | null = null;
        const { data: ownerLead } = await supabaseAdmin
          .from("leads")
          .select("user_id")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        ownerId = ownerLead?.user_id ?? null;
        if (!ownerId) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
          ownerId = users?.users?.[0]?.id ?? null;
        }
        if (!ownerId) return json({ error: "No CRM owner account found" }, 500);

        const { data: existing } = await supabaseAdmin
          .from("leads")
          .select("norm_email, norm_phone, norm_domain")
          .eq("user_id", ownerId);

        const seen = new Set<string>();
        for (const row of existing ?? []) {
          if (row.norm_email) seen.add(`e:${row.norm_email}`);
          if (row.norm_phone) seen.add(`p:${row.norm_phone}`);
          if (row.norm_domain) seen.add(`w:${row.norm_domain}`);
        }

        let duplicates_skipped = 0;
        let invalid_skipped = 0;
        const rows: { user_id: string; business_name: string; [key: string]: unknown }[] = [];

        for (const raw of rawItems) {
          if (!raw || typeof raw !== "object") {
            invalid_skipped++;
            continue;
          }
          const item = raw as AnyItem;
          const business_name = pick(item, ["business_name", "name", "title", "businessName"]);
          if (!business_name) {
            invalid_skipped++;
            continue;
          }

          const phone = pick(item, ["phone", "phone_number", "phoneNumber", "telephone"]);
          const email = pick(item, ["email", "emails", "primary_email", "verified_email"]);
          const website = pick(item, ["website", "url", "site", "domain"]);
          const category = pick(item, ["category", "categories", "type", "business_type"]);
          const location = buildLocation(item);
          const business_hours = formatHours(item["opening_hours"] ?? item["openingHours"] ?? item["hours"]);

          const keys = [
            normEmail(email) ? `e:${normEmail(email)}` : "",
            normPhone(phone) ? `p:${normPhone(phone)}` : "",
            normDomain(website) ? `w:${normDomain(website)}` : "",
          ].filter(Boolean);

          if (keys.some((k) => seen.has(k))) {
            duplicates_skipped++;
            continue;
          }
          for (const k of keys) seen.add(k);

          const rating = firstString(item["rating"] ?? item["totalScore"]);
          const reviews = firstString(item["reviews_count"] ?? item["reviewsCount"] ?? item["user_ratings_total"]);
          const noteBits = [
            rating ? `Rating ${rating}` : "",
            reviews ? `${reviews} reviews` : "",
            "Imported from Apify Local Business Leads Scraper",
          ].filter(Boolean);

          rows.push({
            user_id: ownerId,
            business_name: business_name.slice(0, 200),
            category: category ? category.slice(0, 120) : null,
            location: location || null,
            phone: phone || null,
            email: email || null,
            website: website || null,
            business_hours: business_hours || null,
            notes: noteBits.join(" · ").slice(0, 300),
            status: "READY",
            outreach_status: "NOT_QUEUED",
            source: "APIFY_LOCAL_LEADS",
            sms_consent: false,
            opted_out: false,
            stop_outreach: false,
          });
        }

        let inserted = 0;
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const { error, data } = await supabaseAdmin.from("leads").insert(chunk as never).select("id");
          if (error) return json({ error: error.message, received, inserted, duplicates_skipped, invalid_skipped }, 500);
          inserted += data?.length ?? chunk.length;
        }

        await supabaseAdmin.from("automation_logs").insert({
          user_id: ownerId,
          lead_id: null,
          lead_name: "Apify import",
          action: "LEAD_IMPORT",
          channel: "IMPORT",
          result: "SUCCESS",
          detail: `received=${received} inserted=${inserted} duplicates_skipped=${duplicates_skipped} invalid_skipped=${invalid_skipped}`,
        });

        return json({ received, inserted, duplicates_skipped, invalid_skipped });
      },
    },
  },
});
