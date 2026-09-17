DO $$
DECLARE r record; privs text;
BEGIN
  FOR r IN
    SELECT tablename, cmd, roles FROM pg_policies WHERE schemaname='public'
  LOOP
    privs := CASE r.cmd
      WHEN 'ALL' THEN 'SELECT, INSERT, UPDATE, DELETE'
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'INSERT' THEN 'INSERT'
      WHEN 'UPDATE' THEN 'SELECT, UPDATE'
      WHEN 'DELETE' THEN 'SELECT, DELETE'
    END;
    IF privs IS NULL THEN CONTINUE; END IF;
    -- policies scoped to PUBLIC are app rules for signed-in users
    EXECUTE format('GRANT %s ON public.%I TO authenticated', privs, r.tablename);
    IF 'anon' = ANY(r.roles) THEN
      EXECUTE format('GRANT %s ON public.%I TO anon', privs, r.tablename);
    END IF;
  END LOOP;

  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;