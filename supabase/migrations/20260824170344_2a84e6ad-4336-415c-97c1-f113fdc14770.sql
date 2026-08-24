ALTER TABLE public.intercom_connections
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'us',
  ADD COLUMN IF NOT EXISTS api_host text NOT NULL DEFAULT 'api.intercom.io';

ALTER TABLE public.intercom_connections
  DROP CONSTRAINT IF EXISTS intercom_connections_region_check;
ALTER TABLE public.intercom_connections
  ADD CONSTRAINT intercom_connections_region_check CHECK (region IN ('us','eu','au'));

ALTER TABLE public.intercom_connections
  DROP CONSTRAINT IF EXISTS intercom_connections_api_host_check;
ALTER TABLE public.intercom_connections
  ADD CONSTRAINT intercom_connections_api_host_check CHECK (api_host IN ('api.intercom.io','api.eu.intercom.io','api.au.intercom.io'));

UPDATE public.intercom_connections SET region = 'us', api_host = 'api.intercom.io' WHERE region IS NULL OR api_host IS NULL;