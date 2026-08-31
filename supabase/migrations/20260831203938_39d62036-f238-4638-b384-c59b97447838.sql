ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sequence_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_source text,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS norm_email text
    GENERATED ALWAYS AS (nullif(lower(btrim(coalesce(email, ''))), '')) STORED,
  ADD COLUMN IF NOT EXISTS norm_phone text
    GENERATED ALWAYS AS (nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')) STORED,
  ADD COLUMN IF NOT EXISTS norm_domain text
    GENERATED ALWAYS AS (
      nullif(
        regexp_replace(
          regexp_replace(lower(btrim(coalesce(website, ''))), '^https?://', ''),
          '^www\.|/.*$', '', 'g'
        ),
        ''
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS leads_norm_email_idx ON public.leads (user_id, norm_email) WHERE norm_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_norm_phone_idx ON public.leads (user_id, norm_phone) WHERE norm_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_norm_domain_idx ON public.leads (user_id, norm_domain) WHERE norm_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  reason text NOT NULL DEFAULT 'STOP',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_suppressions TO authenticated;
GRANT ALL ON public.sms_suppressions TO service_role;

ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sms suppressions"
  ON public.sms_suppressions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);