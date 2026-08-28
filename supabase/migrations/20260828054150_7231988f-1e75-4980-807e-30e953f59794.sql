ALTER TABLE public.lead_gen_runs
  ADD COLUMN IF NOT EXISTS sourced_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS batch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crawl_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_keys jsonb NOT NULL DEFAULT '[]'::jsonb;