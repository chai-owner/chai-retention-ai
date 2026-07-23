
CREATE TABLE public.zoho_crm_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  api_domain text NOT NULL,
  dc text NOT NULL,
  org_name text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz
);
GRANT ALL ON public.zoho_crm_connections TO service_role;
ALTER TABLE public.zoho_crm_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.zoho_crm_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dc text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.zoho_crm_oauth_states TO service_role;
ALTER TABLE public.zoho_crm_oauth_states ENABLE ROW LEVEL SECURITY;
