
CREATE POLICY "Public read site-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-images');
CREATE POLICY "Admin upload site-images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update site-images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'site-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete site-images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'site-images' AND public.has_role(auth.uid(), 'admin'));
