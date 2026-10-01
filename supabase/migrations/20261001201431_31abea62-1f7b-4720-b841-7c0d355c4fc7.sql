CREATE OR REPLACE FUNCTION public.guard_data_currency()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.data_currency IS DISTINCT FROM OLD.data_currency
     AND OLD.onboarded = true
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Data currency can only be changed from Business profile by an owner or admin';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_data_currency BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_data_currency();