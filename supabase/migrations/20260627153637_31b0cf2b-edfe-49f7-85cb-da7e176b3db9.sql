
CREATE TABLE public.catering_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  event_date DATE,
  event_type TEXT,
  guest_count INT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.catering_inquiries TO anon, authenticated;
GRANT ALL ON public.catering_inquiries TO service_role;
ALTER TABLE public.catering_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit an inquiry" ON public.catering_inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);
