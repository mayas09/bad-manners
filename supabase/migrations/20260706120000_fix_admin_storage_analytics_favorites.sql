GRANT INSERT ON public.analytics_events TO authenticated;

CREATE POLICY "authenticated_insert_own_analytics"
ON public.analytics_events
FOR INSERT TO authenticated
WITH CHECK (customer_id = auth.uid());

CREATE POLICY "admin_manage_all_favorites"
ON public.favorites
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
