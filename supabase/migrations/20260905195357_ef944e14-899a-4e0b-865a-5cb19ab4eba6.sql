CREATE TABLE public.lead_enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  business_name text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted boolean NOT NULL DEFAULT true,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_enrichment_cache TO authenticated;
GRANT ALL ON public.lead_enrichment_cache TO service_role;

ALTER TABLE public.lead_enrichment_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team enrichment cache" ON public.lead_enrichment_cache
  FOR ALL TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

CREATE TRIGGER lead_enrichment_cache_updated
  BEFORE UPDATE ON public.lead_enrichment_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX lead_enrichment_cache_key_idx ON public.lead_enrichment_cache (cache_key);

ALTER TABLE public.lead_gen_runs
  ADD COLUMN IF NOT EXISTS stage_timings jsonb NOT NULL DEFAULT '{}'::jsonb;