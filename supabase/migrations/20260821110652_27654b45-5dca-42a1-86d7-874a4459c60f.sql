-- Phase 2: OAuth state hardening (expiry, provider binding, atomic single-use)

ALTER TABLE public.accounting_oauth_states
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');

ALTER TABLE public.intercom_oauth_states
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'intercom';

ALTER TABLE public.zoho_crm_oauth_states
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'zoho_crm';

-- Old rows stored raw state values and had no expiry; they are unusable now.
DELETE FROM public.accounting_oauth_states;
DELETE FROM public.intercom_oauth_states;
DELETE FROM public.zoho_crm_oauth_states;

CREATE OR REPLACE FUNCTION public.consume_oauth_state(
  p_table text,
  p_state_hash text,
  p_provider text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
BEGIN
  IF p_table NOT IN (
    'accounting_oauth_states',
    'intercom_oauth_states',
    'zoho_crm_oauth_states'
  ) THEN
    RAISE EXCEPTION 'unsupported oauth state table';
  END IF;

  EXECUTE format(
    'DELETE FROM public.%1$I t WHERE t.state = $1 AND ($2 IS NULL OR t.provider = $2) RETURNING to_jsonb(t)',
    p_table
  )
  INTO r
  USING p_state_hash, p_provider;

  IF r IS NULL THEN
    RETURN NULL;
  END IF;

  IF (r->>'expires_at') IS NOT NULL AND (r->>'expires_at')::timestamptz < now() THEN
    RETURN jsonb_build_object('expired', true);
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_state(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_oauth_state(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.consume_oauth_state(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(text, text, text) TO service_role;