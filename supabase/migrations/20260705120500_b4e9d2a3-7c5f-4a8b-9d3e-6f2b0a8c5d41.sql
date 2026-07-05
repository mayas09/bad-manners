-- Lock down SECURITY DEFINER trigger functions that were missing REVOKE
-- statements, following the same pattern already applied to other
-- SECURITY DEFINER functions in this schema. has_role is intentionally
-- left grantable to authenticated since RLS policies depend on it.
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_customer_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_customer_profile_update() FROM PUBLIC, anon, authenticated;
