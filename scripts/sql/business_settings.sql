-- Structured per-day business hours used by the customer-facing pickup slot
-- generator. Apply once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '15:00',
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_of_week)
);

GRANT SELECT ON public.business_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_settings_public_read" ON public.business_settings;
CREATE POLICY "business_settings_public_read"
  ON public.business_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "business_settings_admin_write" ON public.business_settings;
CREATE POLICY "business_settings_admin_write"
  ON public.business_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed defaults: Mon-Fri 8:00-15:00, Sat/Sun 8:30-15:00.
INSERT INTO public.business_settings (day_of_week, open_time, close_time, is_closed) VALUES
  (0, '08:30', '15:00', false),
  (1, '08:00', '15:00', false),
  (2, '08:00', '15:00', false),
  (3, '08:00', '15:00', false),
  (4, '08:00', '15:00', false),
  (5, '08:00', '15:00', false),
  (6, '08:30', '15:00', false)
ON CONFLICT (day_of_week) DO NOTHING;

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_business_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS business_settings_touch ON public.business_settings;
CREATE TRIGGER business_settings_touch
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_business_settings();

NOTIFY pgrst, 'reload schema';
