CREATE OR REPLACE FUNCTION public.protect_org_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- When the parent organisation itself is being deleted the row is already
    -- gone, so the owner membership may cascade away with it.
    IF OLD.role = 'owner'
       AND EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = OLD.org_id) THEN
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