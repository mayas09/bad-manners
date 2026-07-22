-- Fix "schema out of sync" errors and add editable menu sections.
-- Run this once in the Supabase SQL Editor.

-- 1) Ensure site_images has the theming columns the admin/photos page uses.
ALTER TABLE public.site_images
  ADD COLUMN IF NOT EXISTS season_tag text,
  ADD COLUMN IF NOT EXISTS month_tag  int;

-- Some older projects also lack storage_path. Add it for safety.
ALTER TABLE public.site_images
  ADD COLUMN IF NOT EXISTS storage_path text;

-- 2) Editable menu sections (rename existing, add new).
CREATE TABLE IF NOT EXISTS public.menu_sections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  title      text NOT NULL,
  blurb      text,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.menu_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_sections TO authenticated;
GRANT ALL ON public.menu_sections TO service_role;

ALTER TABLE public.menu_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_sections public read"  ON public.menu_sections;
DROP POLICY IF EXISTS "menu_sections admin write"  ON public.menu_sections;
DROP POLICY IF EXISTS "menu_sections admin update" ON public.menu_sections;
DROP POLICY IF EXISTS "menu_sections admin delete" ON public.menu_sections;

CREATE POLICY "menu_sections public read"
  ON public.menu_sections FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "menu_sections admin write"
  ON public.menu_sections FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "menu_sections admin update"
  ON public.menu_sections FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "menu_sections admin delete"
  ON public.menu_sections FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed defaults so nothing disappears on first load.
INSERT INTO public.menu_sections (slug, title, blurb, sort_order) VALUES
  ('coffee',     'Coffee',     'Espresso pulled with care. Beans rotated seasonally.', 1),
  ('non-coffee', 'Non-Coffee', 'For the no-caffeine crew and the matcha devotees.',    2),
  ('tea',        'Tea',        'All teas $4 — hot or iced.',                            3),
  ('seasonal',   'Seasonal',   'Limited-run drinks. When they''re gone, they''re gone.', 4)
ON CONFLICT (slug) DO NOTHING;
