
-- 1. ingest_batches
CREATE TABLE public.ingest_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  source_provider TEXT NOT NULL,
  dataset_key TEXT NOT NULL,
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ingest_batches_user_created_idx ON public.ingest_batches(user_id, created_at DESC);
CREATE INDEX ingest_batches_user_dataset_idx ON public.ingest_batches(user_id, dataset_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingest_batches TO authenticated;
GRANT ALL ON public.ingest_batches TO service_role;

ALTER TABLE public.ingest_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ingest_batches" ON public.ingest_batches FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. ingested_customers
CREATE TABLE public.ingested_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  customer_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, customer_id)
);
CREATE INDEX ingested_customers_user_idx ON public.ingested_customers(user_id);
CREATE INDEX ingested_customers_batch_idx ON public.ingested_customers(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_customers TO authenticated;
GRANT ALL ON public.ingested_customers TO service_role;

ALTER TABLE public.ingested_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ingested_customers" ON public.ingested_customers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. ingested_transactions
CREATE TABLE public.ingested_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  transaction_id TEXT NOT NULL,
  customer_id TEXT,
  amount NUMERIC,
  occurred_at DATE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, transaction_id)
);
CREATE INDEX ingested_transactions_user_idx ON public.ingested_transactions(user_id);
CREATE INDEX ingested_transactions_user_customer_idx ON public.ingested_transactions(user_id, customer_id);
CREATE INDEX ingested_transactions_batch_idx ON public.ingested_transactions(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_transactions TO authenticated;
GRANT ALL ON public.ingested_transactions TO service_role;

ALTER TABLE public.ingested_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ingested_transactions" ON public.ingested_transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. ingested_support
CREATE TABLE public.ingested_support (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  ticket_id TEXT NOT NULL,
  customer_id TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticket_id)
);
CREATE INDEX ingested_support_user_idx ON public.ingested_support(user_id);
CREATE INDEX ingested_support_user_customer_idx ON public.ingested_support(user_id, customer_id);
CREATE INDEX ingested_support_batch_idx ON public.ingested_support(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_support TO authenticated;
GRANT ALL ON public.ingested_support TO service_role;

ALTER TABLE public.ingested_support ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ingested_support" ON public.ingested_support FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. ingested_usage
CREATE TABLE public.ingested_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  customer_id TEXT,
  occurred_at DATE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ingested_usage_user_idx ON public.ingested_usage(user_id);
CREATE INDEX ingested_usage_user_customer_idx ON public.ingested_usage(user_id, customer_id);
CREATE INDEX ingested_usage_batch_idx ON public.ingested_usage(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_usage TO authenticated;
GRANT ALL ON public.ingested_usage TO service_role;

ALTER TABLE public.ingested_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ingested_usage" ON public.ingested_usage FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. ingested_surveys
CREATE TABLE public.ingested_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  customer_id TEXT,
  submitted_at DATE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ingested_surveys_user_idx ON public.ingested_surveys(user_id);
CREATE INDEX ingested_surveys_user_customer_idx ON public.ingested_surveys(user_id, customer_id);
CREATE INDEX ingested_surveys_batch_idx ON public.ingested_surveys(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingested_surveys TO authenticated;
GRANT ALL ON public.ingested_surveys TO service_role;

ALTER TABLE public.ingested_surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ingested_surveys" ON public.ingested_surveys FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger for customers
CREATE TRIGGER update_ingested_customers_updated_at
  BEFORE UPDATE ON public.ingested_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
