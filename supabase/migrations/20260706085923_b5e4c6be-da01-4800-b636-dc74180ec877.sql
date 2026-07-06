
REVOKE ALL ON FUNCTION public.on_order_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_catering_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_customer_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
