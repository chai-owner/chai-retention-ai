CREATE TABLE public.customer_id_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'linked',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_id_aliases TO authenticated;
GRANT ALL ON public.customer_id_aliases TO service_role;

ALTER TABLE public.customer_id_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own customer id aliases"
ON public.customer_id_aliases FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_customer_id_aliases_updated_at
BEFORE UPDATE ON public.customer_id_aliases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();