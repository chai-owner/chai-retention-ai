CREATE TABLE public.demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  website text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.demo_leads TO anon, authenticated;
GRANT SELECT ON public.demo_leads TO authenticated;
GRANT ALL ON public.demo_leads TO service_role;
ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can request a demo" ON public.demo_leads FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can view demo leads" ON public.demo_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));