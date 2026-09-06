DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['automation_logs','clients','email_sends','email_settings','email_suppressions','invoices','lead_enrichment_cache','lead_gen_runs','leads','meetings','messages','sms_suppressions','team_members']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "gated app access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "gated app access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;