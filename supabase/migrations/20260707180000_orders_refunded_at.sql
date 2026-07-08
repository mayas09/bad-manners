-- Track when a refund was issued for an order.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Protect the new column the same way stripe_refund_id is protected: customers
-- cannot set it themselves, only the service role / admin-triggered flows.
CREATE OR REPLACE FUNCTION public.enforce_customer_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted server-side operations use the service role and bypass the
  -- customer column restrictions below.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins bypass column restrictions.
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Only the owner reaches here via RLS; enforce column-level restrictions.
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
     OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
     OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
     OR NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
     OR NEW.pickup_time IS DISTINCT FROM OLD.pickup_time
     OR NEW.order_notes IS DISTINCT FROM OLD.order_notes
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id
     OR NEW.stripe_payment_intent IS DISTINCT FROM OLD.stripe_payment_intent
     OR NEW.stripe_refund_id IS DISTINCT FROM OLD.stripe_refund_id
     OR NEW.refunded_at IS DISTINCT FROM OLD.refunded_at
     OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Customers cannot modify protected order fields';
  END IF;

  -- Status can only transition pending -> cancelled.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' OR NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Customers can only cancel pending orders';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
