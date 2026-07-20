-- C2 fix: prevent customers from forging "paid" orders via direct PostgREST INSERT.
-- The existing RLS INSERT policy only checks auth.uid() = customer_id, leaving
-- payment_status/status/totals fully client-controlled. This trigger forces safe
-- values for any non-admin insert, regardless of what the client sends.
--
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_customer_order_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins and service_role (auth.uid() IS NULL) bypass; the atomic
  -- record_paid_order RPC runs as SECURITY DEFINER and is the only trusted
  -- path that may create paid/confirmed orders.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Customers may only create pending, unpaid orders for themselves.
  NEW.customer_id := auth.uid();
  NEW.status := 'pending';

  IF NEW.payment_status IS NULL
     OR NEW.payment_status NOT IN ('unpaid', 'pay_on_pickup') THEN
    NEW.payment_status := 'unpaid';
  END IF;

  -- Stripe / refund / cancellation metadata must never be set at creation.
  NEW.stripe_payment_intent := NULL;
  NEW.stripe_session_id     := NULL;
  NEW.stripe_refund_id      := NULL;
  NEW.refunded_at           := NULL;
  NEW.cancellation_reason   := NULL;
  NEW.cancelled_by          := NULL;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_customer_order_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_customer_order_insert ON public.orders;
CREATE TRIGGER enforce_customer_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_order_insert();
