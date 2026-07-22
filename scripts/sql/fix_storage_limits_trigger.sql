-- Fix product/gallery/banner upload failures that appear as:
-- "Database schema is out of sync. Please run migrations or contact support."
--
-- Root cause: an older storage trigger referenced NEW.size, but modern
-- Supabase Storage stores file size and mimetype inside storage.objects.metadata.
-- Run this once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.enforce_storage_object_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  bucket_name text;
  max_size bigint;
  allowed text[];
  object_metadata jsonb;
  object_size bigint := 0;
  content_type text;
BEGIN
  object_metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  content_type := NULLIF(COALESCE(object_metadata->>'mimetype', object_metadata->>'contentType'), '');

  SELECT COALESCE(name, NEW.bucket_id) INTO bucket_name
  FROM storage.buckets
  WHERE id = NEW.bucket_id;

  bucket_name := COALESCE(bucket_name, NEW.bucket_id);

  IF bucket_name = 'products' THEN
    max_size := 5 * 1024 * 1024; -- 5 MB
    allowed := ARRAY['image/jpeg', 'image/png', 'image/webp'];
  ELSIF bucket_name = 'users' THEN
    max_size := 2 * 1024 * 1024; -- 2 MB
    allowed := ARRAY['image/jpeg', 'image/png', 'image/webp'];
  ELSIF bucket_name IN ('gallery', 'banners') THEN
    max_size := 10 * 1024 * 1024; -- 10 MB
    allowed := ARRAY['image/jpeg', 'image/png', 'image/webp'];
  ELSE
    RETURN NEW;
  END IF;

  IF object_metadata ? 'size' AND (object_metadata->>'size') ~ '^\d+$' THEN
    object_size := (object_metadata->>'size')::bigint;
  END IF;

  IF object_size > max_size THEN
    RAISE EXCEPTION 'File too large for bucket %: % bytes exceeds % bytes',
      bucket_name, object_size, max_size
      USING ERRCODE = 'check_violation';
  END IF;

  IF content_type IS NOT NULL
     AND NOT (content_type = ANY(allowed)) THEN
    RAISE EXCEPTION 'Disallowed file type for bucket %: %',
      bucket_name, content_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_storage_object_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_storage_object_limits_insert ON storage.objects;
CREATE TRIGGER enforce_storage_object_limits_insert
  BEFORE INSERT OR UPDATE OF bucket_id, metadata ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_storage_object_limits();

-- Refresh PostgREST's cache for recent menu/site image column changes too.
NOTIFY pgrst, 'reload schema';