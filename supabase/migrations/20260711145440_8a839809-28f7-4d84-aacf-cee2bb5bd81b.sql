
-- 1. app_settings: remove public read, allow admin read only
DROP POLICY IF EXISTS "app_settings public read" ON public.app_settings;
CREATE POLICY "app_settings admin read" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. catering_inquiries: replace always-true insert check with required-field validation; add admin read
DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON public.catering_inquiries;
CREATE POLICY "Anyone can submit an inquiry" ON public.catering_inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL AND length(btrim(name)) > 0
    AND email IS NOT NULL AND length(btrim(email)) > 0
    AND message IS NOT NULL AND length(btrim(message)) > 0
  );

CREATE POLICY "Admins can read catering inquiries" ON public.catering_inquiries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. SECURITY DEFINER trigger functions: revoke public/role EXECUTE (triggers run as table owner, unaffected)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_catering_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_order_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_customer_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- has_role is intentionally kept executable to authenticated so RLS policies can invoke it,
-- but revoke from anon since anon policies do not need it.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
