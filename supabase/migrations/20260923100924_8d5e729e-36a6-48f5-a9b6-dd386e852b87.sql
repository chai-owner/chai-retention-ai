-- A partial index can't be used as an upsert conflict target, and rows with a
-- NULL event_id (manual CSV uploads) never collide in a plain unique index
-- anyway, so make it unconditional.
DROP INDEX IF EXISTS public.ingested_usage_user_event_key;

CREATE UNIQUE INDEX IF NOT EXISTS ingested_usage_user_event_key
  ON public.ingested_usage (user_id, event_id);