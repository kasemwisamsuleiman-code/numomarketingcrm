ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'NOT_QUEUED',
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_outreach boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outreach_attempts integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  channel text,
  result text NOT NULL DEFAULT 'SUCCESS',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_logs TO authenticated;
GRANT ALL ON public.automation_logs TO service_role;

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own automation logs" ON public.automation_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS automation_logs_user_created_idx ON public.automation_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_outreach_status_idx ON public.leads (user_id, outreach_status);