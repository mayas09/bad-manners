-- Fix "Upload failed: new row violates row-level security policy" (403)
-- when admins upload product/gallery/banner images.
--
-- Supabase's storage.objects table has RLS enabled by default and only
-- allows what your policies allow. Run this once in the Supabase SQL Editor.

-- Ensure buckets exist and are public where appropriate.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('products', 'products', true),
  ('gallery',  'gallery',  true),
  ('banners',  'banners',  true),
  ('users',    'users',    false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Drop old versions if any (idempotent).
DROP POLICY IF EXISTS "public read product images"    ON storage.objects;
DROP POLICY IF EXISTS "public read gallery images"    ON storage.objects;
DROP POLICY IF EXISTS "public read banner images"     ON storage.objects;
DROP POLICY IF EXISTS "admin write product images"    ON storage.objects;
DROP POLICY IF EXISTS "admin update product images"   ON storage.objects;
DROP POLICY IF EXISTS "admin delete product images"   ON storage.objects;
DROP POLICY IF EXISTS "admin write gallery images"    ON storage.objects;
DROP POLICY IF EXISTS "admin update gallery images"   ON storage.objects;
DROP POLICY IF EXISTS "admin delete gallery images"   ON storage.objects;
DROP POLICY IF EXISTS "admin write banner images"     ON storage.objects;
DROP POLICY IF EXISTS "admin update banner images"    ON storage.objects;
DROP POLICY IF EXISTS "admin delete banner images"    ON storage.objects;

-- Public read for public buckets.
CREATE POLICY "public read product images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'products');

CREATE POLICY "public read gallery images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'gallery');

CREATE POLICY "public read banner images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'banners');

-- Admin-only write/update/delete on those buckets.
CREATE POLICY "admin write product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'products' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin write gallery images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update gallery images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete gallery images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'gallery' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin write banner images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update banner images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete banner images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'));
