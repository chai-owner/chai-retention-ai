ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS data_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS data_currency_suggestion_dismissed text;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_data_currency_check CHECK (data_currency IN ('USD','ZAR'));

ALTER TABLE public.accounting_connections
  ADD COLUMN IF NOT EXISTS base_currency text,
  ADD COLUMN IF NOT EXISTS tenant_currencies jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.data_currency_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid,
  changed_by uuid NOT NULL,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  excluded_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_currency_changes TO authenticated;
GRANT ALL ON public.data_currency_changes TO service_role;
ALTER TABLE public.data_currency_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their org currency changes"
  ON public.data_currency_changes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR changed_by = auth.uid() OR (org_id IS NOT NULL AND public.org_role(auth.uid(), org_id) IS NOT NULL));
CREATE INDEX idx_data_currency_changes_user ON public.data_currency_changes(user_id, created_at DESC);