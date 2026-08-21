ALTER TABLE public.accounting_connections
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_message text;