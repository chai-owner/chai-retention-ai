ALTER TABLE public.organisations DROP CONSTRAINT IF EXISTS organisations_plan_check;
ALTER TABLE public.organisations ADD CONSTRAINT organisations_plan_check CHECK (plan IN ('core','standard','enterprise','elite'));
ALTER TABLE public.organisations DROP CONSTRAINT IF EXISTS organisations_pending_plan_check;
ALTER TABLE public.organisations ADD CONSTRAINT organisations_pending_plan_check CHECK (pending_plan IS NULL OR pending_plan IN ('core','standard','enterprise','elite'));