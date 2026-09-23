CREATE TABLE public.content_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  customer_ref TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  extracted_at TIMESTAMP WITH TIME ZONE,
  extraction_model TEXT,
  skipped_reason TEXT,
  body_expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT content_conversations_unique_source_row UNIQUE (user_id, source, external_id)
);
CREATE INDEX content_conversations_customer_idx ON public.content_conversations (user_id, customer_ref);
CREATE INDEX content_conversations_pending_idx ON public.content_conversations (user_id, extracted_at);
CREATE INDEX content_conversations_expiry_idx ON public.content_conversations (body_expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_conversations TO authenticated;
GRANT ALL ON public.content_conversations TO service_role;
ALTER TABLE public.content_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own conversation content"
  ON public.content_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.content_risk_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.content_conversations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  customer_ref TEXT,
  signal TEXT NOT NULL,
  quote TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  occurred_at TIMESTAMP WITH TIME ZONE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT content_risk_signals_unique UNIQUE (user_id, source, external_id, signal)
);
CREATE INDEX content_risk_signals_customer_idx ON public.content_risk_signals (user_id, customer_ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_risk_signals TO authenticated;
GRANT ALL ON public.content_risk_signals TO service_role;
ALTER TABLE public.content_risk_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own content risk signals"
  ON public.content_risk_signals FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.content_extraction_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  conversations_extracted INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC NOT NULL DEFAULT 0,
  paused_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT content_extraction_usage_unique UNIQUE (user_id, period)
);

GRANT SELECT ON public.content_extraction_usage TO authenticated;
GRANT ALL ON public.content_extraction_usage TO service_role;
ALTER TABLE public.content_extraction_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own extraction usage"
  ON public.content_extraction_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER content_conversations_updated_at
  BEFORE UPDATE ON public.content_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER content_extraction_usage_updated_at
  BEFORE UPDATE ON public.content_extraction_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();