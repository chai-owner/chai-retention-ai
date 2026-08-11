ALTER TABLE public.customer_id_aliases ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.customer_id_aliases DROP CONSTRAINT IF EXISTS customer_id_aliases_user_id_source_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS customer_id_aliases_user_source_sourceid_key ON public.customer_id_aliases (user_id, source, source_id);