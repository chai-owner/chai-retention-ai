ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS ai_usage_log_user_created_idx
  ON public.ai_usage_log (user_id, created_at DESC);