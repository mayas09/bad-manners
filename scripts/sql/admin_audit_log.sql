-- Admin audit log: tracks sensitive admin actions (order status changes,
-- refunds, role grants, menu discounts). Read-only from the app; admins
-- can SELECT, no one can UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies: only SECURITY DEFINER triggers write.

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
  ON public.admin_audit_log (actor_id, created_at DESC);

-- Generic trigger fn for orders: logs status / payment_status / refund changes.
CREATE OR REPLACE FUNCTION public.log_order_admin_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  is_admin := public.has_role(auth.uid(), 'admin');
  IF NOT is_admin THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
     OR OLD.stripe_refund_id IS DISTINCT FROM NEW.stripe_refund_id THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_table, target_id, before_data, after_data)
    VALUES (
      auth.uid(),
      'order.update',
      'orders',
      NEW.id::text,
      jsonb_build_object('status', OLD.status, 'payment_status', OLD.payment_status, 'stripe_refund_id', OLD.stripe_refund_id),
      jsonb_build_object('status', NEW.status, 'payment_status', NEW.payment_status, 'stripe_refund_id', NEW.stripe_refund_id)
    );
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.log_order_admin_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_log_order_admin_changes ON public.orders;
CREATE TRIGGER trg_log_order_admin_changes
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_admin_changes();

-- Log role grants/revokes on user_roles.
CREATE OR REPLACE FUNCTION public.log_user_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_table, target_id, after_data)
    VALUES (auth.uid(), 'role.grant', 'user_roles', NEW.user_id::text,
            jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_table, target_id, before_data)
    VALUES (auth.uid(), 'role.revoke', 'user_roles', OLD.user_id::text,
            jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.log_user_role_changes() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_log_user_role_changes ON public.user_roles;
CREATE TRIGGER trg_log_user_role_changes
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_role_changes();
