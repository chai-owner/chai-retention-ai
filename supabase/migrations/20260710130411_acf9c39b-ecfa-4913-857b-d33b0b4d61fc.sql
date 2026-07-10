CREATE POLICY "Users can insert their own AI usage"
  ON public.ai_usage_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);