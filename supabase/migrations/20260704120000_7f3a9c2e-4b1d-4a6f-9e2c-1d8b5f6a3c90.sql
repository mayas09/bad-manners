-- Add a payment_status value for orders that skip Stripe and pay at pickup
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'pay_on_pickup';

-- Fix: the customer-update guard trigger ran for every role, including the
-- service_role connection finalizeOrder() uses to record a Stripe payment.
-- Since that connection has no auth.uid(), has_role() always evaluated to
-- false, so the trigger rejected the payment_status change and orders were
-- silently left as 'unpaid' even after a successful Stripe payment.
CREATE OR REPLACE FUNCTION public.enforce_customer_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted server-side operations (e.g. Stripe payment verification) use
  -- the service role and bypass the customer column restrictions below.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins bypass column restrictions
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Only the owner reaches here via RLS; enforce column-level restrictions
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
     OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.stripe_payment_intent IS DISTINCT FROM OLD.stripe_payment_intent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Customers cannot modify financial or identity fields on orders';
  END IF;

  -- Status can only transition pending -> cancelled
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' OR NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Customers can only cancel pending orders';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
