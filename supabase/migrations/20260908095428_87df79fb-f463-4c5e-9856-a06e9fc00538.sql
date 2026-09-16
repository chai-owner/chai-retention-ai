CREATE OR REPLACE FUNCTION public.org_role(_user_id uuid, _org_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT role FROM public.organisation_members
   WHERE user_id = _user_id AND org_id = _org_id
     AND (current_user = 'service_role' OR _user_id = auth.uid())
   LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND (current_user = 'service_role' OR user_uuid = auth.uid())
      AND provider = 'paddle'
      AND environment = check_env
      AND (
        (status IN ('active', 'trialing', 'past_due')
          AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$function$;