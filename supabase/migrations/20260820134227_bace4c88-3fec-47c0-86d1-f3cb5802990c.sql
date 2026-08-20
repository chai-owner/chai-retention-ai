ALTER TABLE public.zendesk_connections
  ADD COLUMN IF NOT EXISTS token_type text,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS zendesk_account_id text,
  ADD COLUMN IF NOT EXISTS zendesk_account_email text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS refresh_lock_at timestamptz;

ALTER TABLE public.zendesk_oauth_states
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');

DELETE FROM public.zendesk_oauth_states WHERE created_at < now() - interval '1 day';