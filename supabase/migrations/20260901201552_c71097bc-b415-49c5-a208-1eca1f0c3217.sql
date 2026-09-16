ALTER TABLE public.ingested_transactions
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS amount_due numeric,
  ADD COLUMN IF NOT EXISTS paid_date date,
  ADD COLUMN IF NOT EXISTS days_overdue integer;

CREATE INDEX IF NOT EXISTS ingested_transactions_overdue_idx
  ON public.ingested_transactions (user_id, customer_id)
  WHERE days_overdue IS NOT NULL AND days_overdue > 0;