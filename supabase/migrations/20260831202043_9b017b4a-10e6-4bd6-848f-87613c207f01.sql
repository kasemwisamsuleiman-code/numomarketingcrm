CREATE TABLE IF NOT EXISTS public.email_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  from_name TEXT NOT NULL DEFAULT 'Numo Marketing',
  from_email TEXT NOT NULL DEFAULT '',
  reply_to TEXT NOT NULL DEFAULT '',
  daily_cap INTEGER NOT NULL DEFAULT 50,
  send_start_hour INTEGER NOT NULL DEFAULT 9,
  send_end_hour INTEGER NOT NULL DEFAULT 17,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  follow_up_delay_days INTEGER NOT NULL DEFAULT 3,
  max_follow_ups INTEGER NOT NULL DEFAULT 2,
  live_enabled BOOLEAN NOT NULL DEFAULT false,
  initial_subject TEXT NOT NULL DEFAULT 'Quick idea for {{business_name}}',
  initial_body TEXT NOT NULL DEFAULT E'Hi {{business_name}} team,\n\n{{personalized_line}}\n\nWe help {{category}} businesses in {{location}} get found and booked online. Open to a quick 10-minute chat this week?\n\n- {{from_name}}',
  follow_up_subject TEXT NOT NULL DEFAULT 'Following up — {{business_name}}',
  follow_up_body TEXT NOT NULL DEFAULT E'Hi {{business_name}} team,\n\nJust floating this back to the top of your inbox in case it got buried.\n\nHappy to share a couple of quick ideas for {{business_name}} whenever suits.\n\n- {{from_name}}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email settings" ON public.email_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'MANUAL',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_user_email_idx ON public.email_suppressions (user_id, lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_suppressions TO service_role;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own suppressions" ON public.email_suppressions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL DEFAULT '',
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'INITIAL',
  provider TEXT NOT NULL DEFAULT 'RESEND',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'SENT',
  error TEXT,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_sends_user_created_idx ON public.email_sends (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sends TO authenticated;
GRANT ALL ON public.email_sends TO service_role;
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email sends" ON public.email_sends FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER email_settings_updated_at BEFORE UPDATE ON public.email_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();