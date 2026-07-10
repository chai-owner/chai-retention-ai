-- Profiles: identity + lock state
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unlocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS booked_at timestamp with time zone;

-- Trigger: copy name/email from auth.users into profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = CASE WHEN public.profiles.full_name = '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
        email = CASE WHEN public.profiles.email = '' THEN EXCLUDED.email ELSE public.profiles.email END;
  RETURN NEW;
END;
$function$;

-- AI usage log
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  model text NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own AI usage"
  ON public.ai_usage_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all AI usage"
  ON public.ai_usage_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Impersonation audit (admin only)
CREATE TABLE IF NOT EXISTS public.impersonation_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone
);
GRANT SELECT ON public.impersonation_audit TO authenticated;
GRANT ALL ON public.impersonation_audit TO service_role;
ALTER TABLE public.impersonation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view impersonation audit"
  ON public.impersonation_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));