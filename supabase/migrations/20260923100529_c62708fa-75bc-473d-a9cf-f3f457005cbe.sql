-- Activity/usage rows pulled by automated syncs need a stable natural key so a
-- nightly re-run updates the same row instead of duplicating it. Manual CSV
-- uploads leave event_id null and keep their insert-only behaviour.
ALTER TABLE public.ingested_usage ADD COLUMN IF NOT EXISTS event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ingested_usage_user_event_key
  ON public.ingested_usage (user_id, event_id)
  WHERE event_id IS NOT NULL;