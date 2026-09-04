ALTER TABLE public.organisations
  ALTER COLUMN trial_ends_at SET DEFAULT now() + interval '14 days';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organisation_id uuid;
BEGIN
  INSERT INTO public.organisations (
    name,
    plan,
    trial_ends_at
  )
  VALUES (
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'standard',
    now() + interval '14 days'
  )
  RETURNING id INTO v_organisation_id;

  INSERT INTO public.organisation_members (
    organisation_id,
    user_id,
    role,
    email
  )
  VALUES (
    v_organisation_id,
    new.id,
    'owner',
    new.email
  );

  RETURN new;
END;
$$;