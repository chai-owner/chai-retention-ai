-- 1. RLS policies for tables with RLS enabled but no policies.
-- These tables store OAuth tokens / encrypted keys and are only ever touched by
-- service_role (which bypasses RLS). Owner-scoped policies are added so access is
-- explicitly defined; no table-level GRANTs are added, keeping tokens off the Data API.

CREATE POLICY "Owners manage their accounting connections"
  ON public.accounting_connections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage their accounting oauth states"
  ON public.accounting_oauth_states FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage their app user connections"
  ON public.app_user_connections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage their zoho crm connections"
  ON public.zoho_crm_connections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage their zoho crm oauth states"
  ON public.zoho_crm_oauth_states FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Extension in public schema: pg_net is registered in public, though all of its
-- objects live in the dedicated net schema, so relocating the extension does not
-- move or rename net.http_post and existing callers keep working.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    BEGIN
      ALTER EXTENSION pg_net SET SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pg_net relocation skipped: %', SQLERRM;
    END;
  END IF;
END $$;

-- 3. SECURITY DEFINER execute grants.
-- replace_customer_scores writes scores for an arbitrary user id and is only invoked
-- by the daily scoring job with the service role: revoke public/anon/authenticated.
REVOKE ALL ON FUNCTION public.replace_customer_scores(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_customer_scores(uuid, jsonb) TO service_role;

-- Defensive: keep every other SECURITY DEFINER helper off anon.
REVOKE ALL ON FUNCTION public.consume_oauth_state(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(text, text, text) TO service_role;

-- current_org_id / org_role / can_manage_org are referenced inside RLS policy
-- expressions, which are evaluated with the caller's privileges, so signed-in users
-- must retain EXECUTE. They are read-only, take no untrusted table names, and pin
-- their search_path; anon access is removed.
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.org_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_role(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid) TO authenticated, service_role;

-- Explicit search_path on every SECURITY DEFINER function (all already had one;
-- re-asserted here so the guarantee is captured in migration history).
ALTER FUNCTION public.current_org_id() SET search_path = public, pg_catalog;
ALTER FUNCTION public.org_role(uuid, uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.can_manage_org(uuid) SET search_path = public, pg_catalog;
ALTER FUNCTION public.replace_customer_scores(uuid, jsonb) SET search_path = public, pg_catalog;
ALTER FUNCTION public.consume_oauth_state(text, text, text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_catalog;
