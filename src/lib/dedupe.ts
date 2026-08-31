import { normalizeKey, normalizePhone } from "@/lib/crm";

/**
 * Stable dedupe keys for a lead: business name (+location) plus any strong
 * identifier we actually have (email, phone, website host).
 */
export function dedupeKeys(lead: {
  business_name?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}) {
  const keys: string[] = [];
  const name = normalizeKey(lead.business_name);
  if (name) keys.push(`n:${name}|${normalizeKey(lead.location)}`);
  const email = normalizeKey(lead.email);
  if (email.includes("@")) keys.push(`e:${email}`);
  const phone = normalizePhone(lead.phone);
  if (phone.length >= 7) keys.push(`p:${phone.slice(-10)}`);
  const host = websiteHost(lead.website);
  if (host) keys.push(`w:${host}`);
  return keys;
}

export function websiteHost(website: string | null | undefined) {
  const raw = (website ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Ids of leads that collide with another lead on any dedupe key. */
export function findDuplicateIds<T extends { id: string } & Parameters<typeof dedupeKeys>[0]>(leads: T[]) {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const lead of leads) {
    for (const key of dedupeKeys(lead)) {
      const prev = seen.get(key);
      if (prev && prev !== lead.id) {
        dupes.add(prev);
        dupes.add(lead.id);
      } else if (!prev) {
        seen.set(key, lead.id);
      }
    }
  }
  return dupes;
}

/** True when `candidate` matches any existing lead on a dedupe key. */
export function isDuplicateOf(
  candidate: Parameters<typeof dedupeKeys>[0],
  existing: (Parameters<typeof dedupeKeys>[0] & { id: string })[],
  ignoreId?: string,
) {
  const keys = new Set(dedupeKeys(candidate));
  return existing.some((l) => l.id !== ignoreId && dedupeKeys(l).some((k) => keys.has(k)));
}
