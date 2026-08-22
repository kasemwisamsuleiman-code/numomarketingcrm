import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GeneratedLead = {
  id: string;
  business_name: string;
  category: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  lead_score: number | null;
  outreach_channel: string | null;
  personalized_line: string | null;
};

export const getLeadGenStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { hasApify, aiProvider } = await import("./leadgen.server");
    const { hasOpenAi } = await import("./openai.server");
    return {
      apifyConnected: hasApify(),
      aiConnected: Boolean(process.env["LOVABLE_API_KEY"]) || hasOpenAi(),
      openaiConfigured: hasOpenAi(),
      // Provider that production lead qualification will actually use.
      aiProvider: aiProvider(),
    };
  });


/** Free readiness check for the user-supplied OpenAI key (no paid completion). */
export const verifyOpenAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { verifyOpenAiKey } = await import("./openai.server");
    const { ok, status } = await verifyOpenAiKey();
    if (status === 0) return { ok: false, message: "No OPENAI_API_KEY secret is configured." };
    if (ok) return { ok: true, message: "OpenAI key verified." };
    if (status === 401) return { ok: false, message: "OpenAI rejected the configured key." };
    return { ok: false, message: `OpenAI check failed (${status}).` };
  });

export const generateLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { category: string; location: string; count: number }) => {
    const category = String(input?.category ?? "").trim();
    const location = String(input?.location ?? "").trim();
    const count = Math.max(1, Math.min(50, Math.round(Number(input?.count ?? 10))));
    if (!category) throw new Error("Business type is required.");
    if (!location) throw new Error("Location is required.");
    return { category, location, count };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { hasApify, scrapeWithApify, draftCandidates, qualifyCandidates, normalizeName, aiProvider, matchesLocation } =
      await import("./leadgen.server");


    const usedApify = hasApify();
    const provider = aiProvider();
    if (!provider) throw new Error("No AI provider is configured — add OPENAI_API_KEY to enable lead qualification.");
    const source = `${usedApify ? "APIFY" : "AI SOURCED"} + ${provider}`;


    let created = 0;
    let duplicates = 0;
    let rejected = 0;
    let insertedLeads: GeneratedLead[] = [];

    try {
      const sourced = usedApify
        ? await scrapeWithApify(data.category, data.location, data.count)
        : await draftCandidates(data.category, data.location, data.count);

      // Defensive geo guard: drop clearly out-of-region candidates before qualification.
      const candidates = sourced.filter((c) => matchesLocation(c.location, data.location));
      let offRegion = sourced.length - candidates.length;

      const { qualified: qualifiedRaw, rejected: dropped } = await qualifyCandidates(
        candidates,
        data.category,
        data.location,
      );
      // Second guard in case the model rewrites/hallucinates an address.
      const qualified = qualifiedRaw.filter((lead) => {
        if (matchesLocation(lead.location, data.location)) return true;
        offRegion += 1;
        return false;
      });
      rejected = dropped + offRegion;

      const { data: existing, error: existingError } = await supabase.from("leads").select("business_name");
      if (existingError) throw new Error(existingError.message);
      const seen = new Set((existing ?? []).map((row) => normalizeName(String(row.business_name))));

      const rows = qualified
        .filter((lead) => {
          const key = normalizeName(lead.business_name);
          if (seen.has(key)) {
            duplicates += 1;
            return false;
          }
          seen.add(key);
          return true;
        })

        .slice(0, data.count)
        .map((lead) => ({
          user_id: userId,
          business_name: lead.business_name,
          category: lead.category,
          location: lead.location,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          business_hours: lead.business_hours,
          personalized_line: lead.personalized_line,
          lead_score: lead.lead_score,
          outreach_channel: lead.outreach_channel,
          source,
          status: "READY",
          notes: lead.notes,
        }));

      if (rows.length > 0) {
        const { data: inserted, error } = await supabase.from("leads").insert(rows).select();
        if (error) throw new Error(error.message);
        insertedLeads = (inserted ?? []).map((row) => ({
          id: String(row.id),
          business_name: String(row.business_name),
          category: row.category ?? null,
          location: row.location ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          lead_score: row.lead_score ?? null,
          outreach_channel: row.outreach_channel ?? null,
          personalized_line: row.personalized_line ?? null,
        }));
        created = insertedLeads.length;
      }

      await supabase.from("lead_gen_runs").insert({
        user_id: userId,
        category: data.category,
        location: data.location,
        requested: data.count,
        created_count: created,
        skipped_duplicates: duplicates,
        rejected_count: rejected,
        source,
        status: "COMPLETED",
      });

      return { created, duplicates, rejected, source, provider, sourcing: usedApify ? "APIFY" : "AI SOURCED", leads: insertedLeads };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lead generation failed.";
      await supabase.from("lead_gen_runs").insert({
        user_id: userId,
        category: data.category,
        location: data.location,
        requested: data.count,
        source,
        status: "FAILED",
        error: message,
      });
      throw new Error(message);
    }
  });
