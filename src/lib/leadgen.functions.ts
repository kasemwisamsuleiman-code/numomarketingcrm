import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLeadGenStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { hasApify } = await import("./leadgen.server");
    return {
      apifyConnected: hasApify(),
      aiConnected: Boolean(process.env["LOVABLE_API_KEY"]),
    };
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
    const { hasApify, scrapeWithApify, draftCandidates, qualifyCandidates, normalizeName } = await import(
      "./leadgen.server"
    );

    const usedApify = hasApify();
    const source = usedApify ? "APIFY + AI" : "AI SOURCED";

    let created = 0;
    let duplicates = 0;
    let rejected = 0;
    let insertedLeads: Array<Record<string, unknown>> = [];

    try {
      const candidates = usedApify
        ? await scrapeWithApify(data.category, data.location, data.count)
        : await draftCandidates(data.category, data.location, data.count);

      const { qualified, rejected: dropped } = await qualifyCandidates(candidates, data.category, data.location);
      rejected = dropped;

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
        insertedLeads = (inserted ?? []) as Array<Record<string, unknown>>;
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

      return { created, duplicates, rejected, source, leads: insertedLeads };
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
