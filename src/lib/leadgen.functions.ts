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
    const { hasApify, startApifyRun, aiProvider } = await import("./leadgen.server");
    const usedApify = hasApify();
    const provider = aiProvider();
    if (!provider) throw new Error("No AI provider is configured — add OPENAI_API_KEY to enable lead qualification.");
    if (!usedApify) throw new Error("Apify is not connected. Lead generation cannot start.");
    const source = `${usedApify ? "APIFY" : "AI SOURCED"} + ${provider}`;
    try {
      const apify = await startApifyRun(data.category, data.location, data.count);
      const { data: run, error } = await supabase.from("lead_gen_runs").insert({
        user_id: userId,
        category: data.category,
        location: data.location,
        requested: data.count,
        source,
        status: "SOURCING",
        apify_run_id: apify.runId,
        apify_dataset_id: apify.datasetId,
      }).select("id, status, source").single();
      if (error || !run) throw new Error(error?.message ?? "Could not save the generation job.");
      return { runId: run.id, status: run.status, source: run.source, provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lead generation failed.";
      throw new Error(message);
    }
  });

export const advanceLeadGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => {
    const runId = String(input?.runId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("Invalid generation job.");
    return { runId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pipeline = await import("./leadgen.server");
    const { data: run, error: runError } = await supabase
      .from("lead_gen_runs")
      .select("*")
      .eq("id", data.runId)
      .single();
    if (runError || !run) throw new Error("Generation job not found.");

    if (run.status === "COMPLETED" || run.status === "FAILED") return { ...run, leads: [] as GeneratedLead[] };

    try {
      let datasetId = run.apify_dataset_id;
      if (run.status === "SOURCING") {
        if (!run.apify_run_id) throw new Error("This job is missing its Apify run reference.");
        const apify = await pipeline.getApifyRun(run.apify_run_id);
        if (["READY", "RUNNING"].includes(apify.status)) return { ...run, providerStatus: apify.status, leads: [] as GeneratedLead[] };
        if (apify.status !== "SUCCEEDED" && apify.status !== "TIMING-OUT") {
          throw new Error(`Apify ended with status ${apify.status}.`);
        }
        datasetId = apify.datasetId ?? datasetId;
        if (!datasetId) throw new Error("Apify completed without a results dataset.");
        const now = new Date().toISOString();
        const { data: claimed, error: claimError } = await supabase
          .from("lead_gen_runs")
          .update({ status: "QUALIFYING", apify_dataset_id: datasetId, processing_started_at: now })
          .eq("id", run.id)
          .eq("status", "SOURCING")
          .select("id")
          .maybeSingle();
        if (claimError) throw new Error(claimError.message);
        if (!claimed) return { ...run, status: "QUALIFYING", leads: [] as GeneratedLead[] };
      } else if (run.status === "QUALIFYING") {
        const started = run.processing_started_at ? new Date(run.processing_started_at).getTime() : 0;
        if (Date.now() - started < 120_000) return { ...run, leads: [] as GeneratedLead[] };
        const now = new Date().toISOString();
        const staleBefore = new Date(Date.now() - 120_000).toISOString();
        const { data: reclaimed } = await supabase
          .from("lead_gen_runs")
          .update({ processing_started_at: now })
          .eq("id", run.id)
          .eq("status", "QUALIFYING")
          .lt("processing_started_at", staleBefore)
          .select("id")
          .maybeSingle();
        if (!reclaimed) return { ...run, leads: [] as GeneratedLead[] };
      }

      if (!datasetId) throw new Error("Apify results are unavailable for this job.");
      const sourced = await pipeline.getApifyDataset(datasetId, run.requested, run.category, run.location);
      const candidates = sourced.filter((candidate) => pipeline.matchesLocation(candidate.location, run.location));
      let offRegion = sourced.length - candidates.length;
      const { qualified: rawQualified, rejected: dropped } = await pipeline.qualifyCandidates(candidates, run.category, run.location);
      const qualified = rawQualified.filter((lead) => {
        if (pipeline.matchesLocation(lead.location, run.location)) return true;
        offRegion += 1;
        return false;
      });
      const { data: existing, error: existingError } = await supabase.from("leads").select("business_name");
      if (existingError) throw new Error(existingError.message);
      const seen = new Set((existing ?? []).map((row) => pipeline.normalizeName(String(row.business_name))));
      let duplicates = 0;
      const rows = qualified.filter((lead) => {
        const key = pipeline.normalizeName(lead.business_name);
        if (seen.has(key)) { duplicates += 1; return false; }
        seen.add(key);
        return true;
      }).slice(0, run.requested).map((lead) => ({
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
        source: run.source,
        status: "READY",
        notes: lead.notes,
      }));
      let insertedLeads: GeneratedLead[] = [];
      if (rows.length > 0) {
        const { data: inserted, error } = await supabase.from("leads").insert(rows).select();
        if (error) throw new Error(error.message);
        insertedLeads = (inserted ?? []).map((row) => ({
          id: String(row.id), business_name: String(row.business_name), category: row.category ?? null,
          location: row.location ?? null, phone: row.phone ?? null, email: row.email ?? null,
          lead_score: row.lead_score ?? null, outreach_channel: row.outreach_channel ?? null,
          personalized_line: row.personalized_line ?? null,
        }));
      }
      const rejected = dropped + offRegion;
      const completedAt = new Date().toISOString();
      const { error: completeError } = await supabase.from("lead_gen_runs").update({
        status: "COMPLETED", created_count: insertedLeads.length, skipped_duplicates: duplicates,
        rejected_count: rejected, completed_at: completedAt, error: null,
      }).eq("id", run.id).eq("status", "QUALIFYING");
      if (completeError) throw new Error(completeError.message);
      return { ...run, status: "COMPLETED", created_count: insertedLeads.length, skipped_duplicates: duplicates, rejected_count: rejected, completed_at: completedAt, leads: insertedLeads };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lead generation failed.";
      await supabase.from("lead_gen_runs").update({ status: "FAILED", error: message, completed_at: new Date().toISOString() }).eq("id", run.id);
      return { ...run, status: "FAILED", error: message, leads: [] as GeneratedLead[] };
    }
  });
