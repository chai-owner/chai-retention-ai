-- 1. Tables ------------------------------------------------------------------
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth','pro')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organisation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE public.organisation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_members_org ON public.organisation_members(org_id);
CREATE INDEX idx_org_invites_org ON public.organisation_invites(org_id);
CREATE INDEX idx_org_invites_email ON public.organisation_invites(lower(email));

-- 2. Grants -------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT ALL ON public.organisations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_members TO authenticated;
GRANT ALL ON public.organisation_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_invites TO authenticated;
GRANT ALL ON public.organisation_invites TO service_role;

-- 3. Helper functions (security definer, avoid recursive RLS) ------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.organisation_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.org_role(_user_id uuid, _org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organisation_members
   WHERE user_id = _user_id AND org_id = _org_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.org_role(auth.uid(), _org_id) IN ('owner','admin')
$$;

-- Owner protection: owner row cannot be demoted or deleted.
CREATE OR REPLACE FUNCTION public.protect_org_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      RAISE EXCEPTION 'The organisation owner cannot be removed';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    RAISE EXCEPTION 'The organisation owner role cannot be changed';
  END IF;
  IF OLD.role <> 'owner' AND NEW.role = 'owner' THEN
    RAISE EXCEPTION 'Ownership cannot be granted directly';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_org_owner
BEFORE UPDATE OR DELETE ON public.organisation_members
FOR EACH ROW EXECUTE FUNCTION public.protect_org_owner();

CREATE TRIGGER trg_organisations_updated_at
BEFORE UPDATE ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_organisation_members_updated_at
BEFORE UPDATE ON public.organisation_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS ----------------------------------------------------------------------
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their organisation"
ON public.organisations FOR SELECT TO authenticated
USING (id = public.current_org_id());

CREATE POLICY "Owners can update their organisation"
ON public.organisations FOR UPDATE TO authenticated
USING (public.org_role(auth.uid(), id) = 'owner')
WITH CHECK (public.org_role(auth.uid(), id) = 'owner');

CREATE POLICY "Members can view their team"
ON public.organisation_members FOR SELECT TO authenticated
USING (org_id = public.current_org_id());

CREATE POLICY "Owners and admins can add members"
ON public.organisation_members FOR INSERT TO authenticated
WITH CHECK (public.can_manage_org(org_id));

CREATE POLICY "Owners and admins can update members"
ON public.organisation_members FOR UPDATE TO authenticated
USING (public.can_manage_org(org_id))
WITH CHECK (public.can_manage_org(org_id));

CREATE POLICY "Owners and admins can remove members"
ON public.organisation_members FOR DELETE TO authenticated
USING (public.can_manage_org(org_id));

CREATE POLICY "Owners and admins can view invites"
ON public.organisation_invites FOR SELECT TO authenticated
USING (public.can_manage_org(org_id));

CREATE POLICY "Owners and admins can create invites"
ON public.organisation_invites FOR INSERT TO authenticated
WITH CHECK (public.can_manage_org(org_id));

CREATE POLICY "Owners and admins can cancel invites"
ON public.organisation_invites FOR DELETE TO authenticated
USING (public.can_manage_org(org_id));

-- 5. Auto-provision organisation on signup ------------------------------------
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
      INSERT INTO public.organisations (name, owner_id)
      VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company', ''), 'My organisation'), NEW.id)
      RETURNING id INTO v_org_id;
      INSERT INTO public.organisation_members (org_id, user_id, role, accepted_at)
      VALUES (v_org_id, NEW.id, 'owner', now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Backfill existing accounts ------------------------------------------------
DO $$
DECLARE
  r record;
  v_org_id uuid;
BEGIN
  FOR r IN
    SELECT p.id, p.company
      FROM public.profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.organisation_members m WHERE m.user_id = p.id)
  LOOP
    INSERT INTO public.organisations (name, owner_id)
    VALUES (COALESCE(NULLIF(r.company, ''), 'My organisation'), r.id)
    RETURNING id INTO v_org_id;
    INSERT INTO public.organisation_members (org_id, user_id, role, accepted_at)
    VALUES (v_org_id, r.id, 'owner', now());
  END LOOP;
END;
$$;