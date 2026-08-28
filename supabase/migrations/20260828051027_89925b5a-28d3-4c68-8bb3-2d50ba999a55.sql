ALTER TABLE public.lead_gen_runs
  ADD COLUMN IF NOT EXISTS apify_run_id text,
  ADD COLUMN IF NOT EXISTS apify_dataset_id text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS lead_gen_runs_user_status_created_idx
  ON public.lead_gen_runs (user_id, status, created_at DESC);