-- Intercom per-user OAuth connection state
CREATE TABLE public.intercom_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  workspace_id text,
  workspace_name text,
  app_id text,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intercom_connections TO authenticated;
GRANT ALL ON public.intercom_connections TO service_role;
ALTER TABLE public.intercom_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own Intercom connection"
  ON public.intercom_connections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_intercom_connections_updated
  BEFORE UPDATE ON public.intercom_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OAuth state parameters (CSRF nonce store) for the Intercom callback
CREATE TABLE public.intercom_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intercom_oauth_states TO authenticated;
GRANT ALL ON public.intercom_oauth_states TO service_role;
ALTER TABLE public.intercom_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own Intercom oauth states"
  ON public.intercom_oauth_states FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
