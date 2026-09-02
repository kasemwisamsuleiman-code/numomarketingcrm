CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

INSERT INTO public.team_members (email, note)
SELECT lower(email), 'Founding account' FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members t
    WHERE t.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

CREATE POLICY "team can view members" ON public.team_members
  FOR SELECT TO authenticated USING (public.is_team_member());
CREATE POLICY "team can add members" ON public.team_members
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member());
CREATE POLICY "team can update members" ON public.team_members
  FOR UPDATE TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member());
CREATE POLICY "team can remove members" ON public.team_members
  FOR DELETE TO authenticated USING (public.is_team_member());

CREATE TRIGGER team_members_updated BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY "own leads" ON public.leads;
CREATE POLICY "team leads" ON public.leads FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own clients" ON public.clients;
CREATE POLICY "team clients" ON public.clients FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own meetings" ON public.meetings;
CREATE POLICY "team meetings" ON public.meetings FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own invoices" ON public.invoices;
CREATE POLICY "team invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own lead gen runs" ON public.lead_gen_runs;
CREATE POLICY "team lead gen runs" ON public.lead_gen_runs FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own automation logs" ON public.automation_logs;
CREATE POLICY "team automation logs" ON public.automation_logs FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own email sends" ON public.email_sends;
CREATE POLICY "team email sends" ON public.email_sends FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own email settings" ON public.email_settings;
CREATE POLICY "team email settings" ON public.email_settings FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "own suppressions" ON public.email_suppressions;
CREATE POLICY "team email suppressions" ON public.email_suppressions FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());

DROP POLICY "Users manage their own sms suppressions" ON public.sms_suppressions;
CREATE POLICY "team sms suppressions" ON public.sms_suppressions FOR ALL TO authenticated
  USING (public.is_team_member()) WITH CHECK (public.is_team_member());