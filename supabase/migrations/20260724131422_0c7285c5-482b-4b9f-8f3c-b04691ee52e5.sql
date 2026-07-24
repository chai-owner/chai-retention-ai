
CREATE TABLE public.freshdesk_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freshdesk_connections TO authenticated;
GRANT ALL ON public.freshdesk_connections TO service_role;

ALTER TABLE public.freshdesk_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own Freshdesk connection"
  ON public.freshdesk_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_freshdesk_connections_updated_at
  BEFORE UPDATE ON public.freshdesk_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
