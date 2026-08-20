ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_score integer,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS outreach_channel text;

CREATE TABLE IF NOT EXISTS public.lead_gen_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  location text NOT NULL,
  requested integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  skipped_duplicates integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'AI',
  status text NOT NULL DEFAULT 'COMPLETED',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_gen_runs TO authenticated;
GRANT ALL ON public.lead_gen_runs TO service_role;
ALTER TABLE public.lead_gen_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead gen runs" ON public.lead_gen_runs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);