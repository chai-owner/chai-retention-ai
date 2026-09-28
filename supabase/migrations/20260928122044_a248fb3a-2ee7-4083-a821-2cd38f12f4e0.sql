UPDATE public.crm_sync_state SET last_synced_at = NULL WHERE provider = 'zoho_crm';

CREATE TABLE public.nightly_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  job text NOT NULL,
  user_id uuid,
  source text NOT NULL,
  provider text NOT NULL,
  step text NOT NULL,
  ok boolean NOT NULL,
  rows_read integer,
  rows_saved integer,
  signals integer,
  duration_ms integer,
  error_type text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nightly_run_log TO authenticated;
GRANT ALL ON public.nightly_run_log TO service_role;
ALTER TABLE public.nightly_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read nightly run log" ON public.nightly_run_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX nightly_run_log_created_idx ON public.nightly_run_log (created_at DESC);
CREATE INDEX nightly_run_log_run_idx ON public.nightly_run_log (run_id);