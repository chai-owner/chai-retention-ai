ALTER TABLE public.organisations DROP CONSTRAINT IF EXISTS organisations_plan_check;
ALTER TABLE public.organisations ALTER COLUMN plan DROP DEFAULT;
UPDATE public.organisations SET plan = CASE plan WHEN 'starter' THEN 'core' WHEN 'growth' THEN 'standard' WHEN 'pro' THEN 'enterprise' ELSE plan END;
ALTER TABLE public.organisations ALTER COLUMN plan SET DEFAULT 'core';
ALTER TABLE public.organisations ADD CONSTRAINT organisations_plan_check CHECK (plan IN ('core','standard','enterprise'));