-- Enforce valid order status / payment_status transitions.
-- Prevents e.g. refunded -> paid, completed -> pending, cancelled -> paid.
-- Admins bypass all checks (for manual corrections).

CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  is_admin boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    is_admin := public.has_role(auth.uid(), 'admin');
  END IF;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- status: pending -> confirmed -> preparing -> ready -> completed
  -- any -> cancelled (only from pending/confirmed)
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'Cannot change status of a completed order';
    END IF;
    IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Cannot change status of a cancelled order';
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'Orders can only be cancelled while pending or confirmed';
    END IF;
  END IF;

  -- payment_status: unpaid -> paid -> refunded (one-way)
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    IF OLD.payment_status = 'refunded' THEN
      RAISE EXCEPTION 'Cannot change payment_status of a refunded order';
    END IF;
    IF OLD.payment_status = 'paid' AND NEW.payment_status = 'unpaid' THEN
      RAISE EXCEPTION 'Cannot revert a paid order back to unpaid';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.enforce_order_status_transitions() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transitions ON public.orders;
CREATE TRIGGER trg_enforce_order_status_transitions
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_status_transitions();
