ALTER TABLE public.impersonation_audit
  ADD COLUMN IF NOT EXISTS end_reason text;

ALTER TABLE public.impersonation_audit
  DROP CONSTRAINT IF EXISTS impersonation_audit_end_reason_check;

ALTER TABLE public.impersonation_audit
  ADD CONSTRAINT impersonation_audit_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN ('manual', 'timeout'));

CREATE INDEX IF NOT EXISTS impersonation_audit_active_target_idx
  ON public.impersonation_audit (target_id, started_at DESC)
  WHERE ended_at IS NULL;