ALTER TABLE public.demo_leads
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS demo_leads_access_token_unique
  ON public.demo_leads (access_token) WHERE access_token IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can request a demo" ON public.demo_leads;
REVOKE INSERT ON public.demo_leads FROM anon;
REVOKE INSERT ON public.demo_leads FROM authenticated;

CREATE TABLE IF NOT EXISTS public.demo_lead_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_lead_attempts_ip_time_idx
  ON public.demo_lead_attempts (ip_hash, created_at DESC);

GRANT ALL ON public.demo_lead_attempts TO service_role;
ALTER TABLE public.demo_lead_attempts ENABLE ROW LEVEL SECURITY;