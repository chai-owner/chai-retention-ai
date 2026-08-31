-- Server-side customer health scoring with daily snapshots.
-- Populated by the score-customers Edge Function (service role only); the
-- owning user can read their own scores but never writes this table directly.

CREATE TABLE public.customer_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('healthy', 'at-risk', 'critical')),
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_latest BOOLEAN NOT NULL DEFAULT true
);

-- Fast "current scoreboard" lookups (dashboard: all latest scores for a user).
CREATE INDEX customer_scores_user_latest_idx
  ON public.customer_scores(user_id, is_latest);

-- Only one latest snapshot per (user, customer) at a time.
CREATE UNIQUE INDEX customer_scores_latest_unique
  ON public.customer_scores(user_id, customer_id) WHERE is_latest;

-- History lookups (a customer's score over time).
CREATE INDEX customer_scores_user_customer_scored_idx
  ON public.customer_scores(user_id, customer_id, scored_at DESC);

GRANT SELECT ON public.customer_scores TO authenticated;
GRANT ALL ON public.customer_scores TO service_role;

ALTER TABLE public.customer_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own customer_scores read" ON public.customer_scores
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service role can manage customer_scores" ON public.customer_scores
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Atomically flips the previous snapshot's is_latest off and inserts the new
-- one, per user, so a dashboard read never sees zero or two "latest" rows for
-- the same customer. p_scores is a JSON array of
-- {customer_id, score, risk_level, score_breakdown}.
CREATE OR REPLACE FUNCTION public.replace_customer_scores(p_user_id UUID, p_scores JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.customer_scores
     SET is_latest = false
   WHERE user_id = p_user_id
     AND is_latest = true;

  INSERT INTO public.customer_scores
    (user_id, customer_id, score, risk_level, score_breakdown, scored_at, is_latest)
  SELECT
    p_user_id,
    row_data->>'customer_id',
    (row_data->>'score')::INTEGER,
    row_data->>'risk_level',
    COALESCE(row_data->'score_breakdown', '{}'::jsonb),
    COALESCE((row_data->>'scored_at')::TIMESTAMPTZ, now()),
    true
  FROM jsonb_array_elements(p_scores) AS row_data;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_customer_scores(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_customer_scores(UUID, JSONB) TO service_role;

-- ============================================================
-- pg_cron: run score-customers daily at 06:00 UTC
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- One-time manual step (not run by this migration — do not put a real key in
-- git): store the project's service_role key in Vault so the cron job can
-- authenticate to the Edge Function. Run once in the SQL editor:
--   select vault.create_secret('<service_role_key>', 'score_customers_service_role_key');
-- To rotate it later: select vault.update_secret((select id from vault.secrets
--   where name = 'score_customers_service_role_key'), '<new_key>');

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'score-customers-daily') THEN
    PERFORM cron.unschedule('score-customers-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'score-customers-daily',
  '0 6 * * *', -- 06:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://viliwsrwkuiavdujxojn.supabase.co/functions/v1/score-customers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'score_customers_service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To revert: SELECT cron.unschedule('score-customers-daily');
