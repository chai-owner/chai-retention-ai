DROP POLICY IF EXISTS "Anyone can join the waitlist" ON public.waitlist;

CREATE POLICY "Anyone can join the waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(name)) > 0 AND length(name) <= 200
  AND length(trim(company)) > 0 AND length(company) <= 200
  AND length(trim(email)) > 0 AND length(email) <= 320
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
);