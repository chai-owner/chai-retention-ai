ALTER TABLE public.accounting_connections
  ADD COLUMN IF NOT EXISTS tenants jsonb NOT NULL DEFAULT '[]'::jsonb;