ALTER TABLE public.organisations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '2 minutes');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.organisation_invites%ROWTYPE;
  v_org_id uuid;
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

  IF NOT EXISTS (SELECT 1 FROM public.organisation_members WHERE user_id = NEW.id) THEN
    SELECT * INTO v_invite
      FROM public.organisation_invites
     WHERE lower(email) = lower(COALESCE(NEW.email, ''))
       AND accepted_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_invite.id IS NOT NULL THEN
      INSERT INTO public.organisation_members (org_id, user_id, role, invited_at, accepted_at)
      VALUES (v_invite.org_id, NEW.id, v_invite.role, v_invite.created_at, now());
      UPDATE public.organisation_invites SET accepted_at = now() WHERE id = v_invite.id;
    ELSE
      INSERT INTO public.organisations (name, owner_id, trial_ends_at)
      VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company', ''), 'My organisation'), NEW.id, now() + interval '2 minutes')
      RETURNING id INTO v_org_id;
      INSERT INTO public.organisation_members (org_id, user_id, role, accepted_at)
      VALUES (v_org_id, NEW.id, 'owner', now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;