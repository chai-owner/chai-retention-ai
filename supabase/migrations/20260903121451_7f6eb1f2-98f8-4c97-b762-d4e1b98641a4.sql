ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_sub_uidx
  ON public.subscriptions (provider, provider_subscription_id);

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS pending_plan text,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_pending_plan_check;
ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_pending_plan_check
  CHECK (pending_plan IS NULL OR pending_plan IN ('core', 'standard', 'enterprise'));

CREATE OR REPLACE FUNCTION public.has_active_subscription(
  user_uuid uuid,
  check_env text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND provider = 'paddle'
      AND environment = check_env
      AND (
        (status IN ('active', 'trialing', 'past_due')
          AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;

SELECT cron.schedule(
  'daily-plan-changes',
  '35 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--474ecf99-b3f5-49b5-b07d-bc012f8f0622.lovable.app/api/public/hooks/plan-changes',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "6fe74c5f2f805d5207476a11a10da4c1ba722f1be7cbcb37fec2d41835751426"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);