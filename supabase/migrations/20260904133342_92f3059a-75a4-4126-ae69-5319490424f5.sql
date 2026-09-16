CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  INSERT INTO public.organisations (name, owner_id, plan, trial_ends_at)
  VALUES (
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), new.email, 'My organisation'),
    new.id,
    'standard',
    now() + interval '14 days'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organisation_members (org_id, user_id, role, accepted_at)
  VALUES (v_org_id, new.id, 'owner', now())
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$function$;