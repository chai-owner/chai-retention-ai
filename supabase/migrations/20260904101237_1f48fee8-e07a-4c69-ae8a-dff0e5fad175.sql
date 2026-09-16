ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_emails_sent text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS downgrade_warning_sent_at timestamptz;

ALTER TABLE public.organisations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

ALTER TABLE public.ingested_customers
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ingested_customers_user_paused_idx
  ON public.ingested_customers (user_id, paused);

ALTER TABLE public.organisation_members
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

SELECT cron.schedule(
  'daily-trial-lifecycle',
  '15 7 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--474ecf99-b3f5-49b5-b07d-bc012f8f0622.lovable.app/api/public/hooks/trial-lifecycle',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "6fe74c5f2f805d5207476a11a10da4c1ba722f1be7cbcb37fec2d41835751426"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);