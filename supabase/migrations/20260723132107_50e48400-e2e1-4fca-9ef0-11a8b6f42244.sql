CREATE TABLE public.zendesk_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subdomain text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamp with time zone,
  scope text,
  org_name text,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.zendesk_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subdomain text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.support_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TRIGGER update_zendesk_connections_updated_at
  BEFORE UPDATE ON public.zendesk_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_sync_state_updated_at
  BEFORE UPDATE ON public.support_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zendesk_connections TO authenticated;
GRANT ALL ON public.zendesk_connections TO service_role;
GRANT SELECT, INSERT, DELETE ON public.zendesk_oauth_states TO authenticated;
GRANT ALL ON public.zendesk_oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_sync_state TO authenticated;
GRANT ALL ON public.support_sync_state TO service_role;

ALTER TABLE public.zendesk_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zendesk_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Zendesk connections"
  ON public.zendesk_connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own Zendesk OAuth states"
  ON public.zendesk_oauth_states
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own support sync state"
  ON public.support_sync_state
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);