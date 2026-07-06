
-- Public read for products/gallery/banners
DROP POLICY IF EXISTS "storage_public_buckets_read" ON storage.objects;
CREATE POLICY "storage_public_buckets_read" ON storage.objects FOR SELECT
USING (bucket_id IN ('products','gallery','banners'));

DROP POLICY IF EXISTS "storage_admin_write_public" ON storage.objects;
CREATE POLICY "storage_admin_write_public" ON storage.objects FOR ALL TO authenticated
USING (bucket_id IN ('products','gallery','banners') AND public.has_role(auth.uid(),'admin'))
WITH CHECK (bucket_id IN ('products','gallery','banners') AND public.has_role(auth.uid(),'admin'));

-- users bucket: owner-scoped (path prefix = auth.uid())
DROP POLICY IF EXISTS "storage_users_owner_read" ON storage.objects;
CREATE POLICY "storage_users_owner_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'users' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

DROP POLICY IF EXISTS "storage_users_owner_write" ON storage.objects;
CREATE POLICY "storage_users_owner_write" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'users' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id = 'users' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));
