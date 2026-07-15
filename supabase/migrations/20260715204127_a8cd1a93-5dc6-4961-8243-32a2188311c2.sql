
ALTER TABLE public.accounting_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.crm_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sync_state TO authenticated;
GRANT ALL ON public.crm_sync_state TO service_role;

ALTER TABLE public.crm_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own crm sync state"
  ON public.crm_sync_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_crm_sync_state_updated_at
  BEFORE UPDATE ON public.crm_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
