-- M-fix: enforce product/user image upload limits in Supabase Storage.
-- Blocks oversized files and disallowed content types at the database level.
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_storage_object_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket_name text;
  max_size bigint;
  allowed text[];
BEGIN
  SELECT name INTO bucket_name
  FROM storage.buckets
  WHERE id = NEW.bucket_id;

  -- Per-bucket limits.
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
    -- Unknown bucket: allow. Add explicit rules above as needed.
    RETURN NEW;
  END IF;

  IF NEW.size > max_size THEN
    RAISE EXCEPTION 'File too large for bucket %: % bytes exceeds % bytes',
      bucket_name, NEW.size, max_size
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.metadata->>'mimetype' IS NOT NULL
     AND NOT (NEW.metadata->>'mimetype' = ANY(allowed)) THEN
    RAISE EXCEPTION 'Disallowed file type for bucket %: %',
      bucket_name, NEW.metadata->>'mimetype'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_storage_object_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_storage_object_limits_insert ON storage.objects;
CREATE TRIGGER enforce_storage_object_limits_insert
  BEFORE INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_storage_object_limits();
