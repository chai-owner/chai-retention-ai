CREATE TABLE public.accounting_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('quickbooks','xero','freshbooks')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  realm_id TEXT,
  tenant_id TEXT,
  account_id TEXT,
  company_name TEXT,
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT ALL ON public.accounting_connections TO service_role;
ALTER TABLE public.accounting_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.accounting_oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('quickbooks','xero','freshbooks')),
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT ALL ON public.accounting_oauth_states TO service_role;
ALTER TABLE public.accounting_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_accounting_connections_updated_at
BEFORE UPDATE ON public.accounting_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();