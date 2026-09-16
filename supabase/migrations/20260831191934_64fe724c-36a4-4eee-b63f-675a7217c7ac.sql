CREATE TABLE public.customer_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  score numeric NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('healthy','at-risk','critical')),
  score_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_latest boolean NOT NULL DEFAULT true,
  scored_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX customer_scores_user_latest_idx ON public.customer_scores (user_id, is_latest);
CREATE INDEX customer_scores_user_customer_idx ON public.customer_scores (user_id, customer_id);

GRANT SELECT ON public.customer_scores TO authenticated;
GRANT ALL ON public.customer_scores TO service_role;

ALTER TABLE public.customer_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own customer scores"
ON public.customer_scores FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.replace_customer_scores(p_user_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.customer_scores SET is_latest = false
   WHERE user_id = p_user_id AND is_latest;

  INSERT INTO public.customer_scores (user_id, customer_id, score, risk_level, score_breakdown, is_latest)
  SELECT p_user_id,
         r->>'customer_id',
         (r->>'score')::numeric,
         r->>'risk_level',
         COALESCE(r->'score_breakdown', '[]'::jsonb),
         true
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_customer_scores(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_customer_scores(uuid, jsonb) TO service_role;

SELECT cron.schedule(
  'daily-customer-scoring',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--474ecf99-b3f5-49b5-b07d-bc012f8f0622.lovable.app/api/public/hooks/daily-score',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "6fe74c5f2f805d5207476a11a10da4c1ba722f1be7cbcb37fec2d41835751426"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);