-- Keep Stripe finalization compatible with order_items.menu_item_id being a UUID.
CREATE OR REPLACE FUNCTION public.finalize_paid_order(
  p_order_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_subtotal_cents integer,
  p_total_cents integer,
  p_discount_cents integer,
  p_pickup_time text,
  p_order_notes text,
  p_stripe_session_id text,
  p_stripe_payment_intent text,
  p_items jsonb
)
RETURNS TABLE(id uuid, already_paid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT orders.payment_status INTO v_existing_status
  FROM public.orders WHERE orders.id = p_order_id FOR UPDATE;

  IF v_existing_status = 'paid' THEN
    RETURN QUERY SELECT p_order_id, true;
    RETURN;
  END IF;

  INSERT INTO public.orders (
    id, customer_id, customer_name, customer_phone, customer_email,
    subtotal_cents, total_cents, discount_cents, pickup_time, order_notes,
    payment_status, status, stripe_session_id, stripe_payment_intent
  ) VALUES (
    p_order_id, p_customer_id, p_customer_name, p_customer_phone, p_customer_email,
    p_subtotal_cents, p_total_cents, p_discount_cents, p_pickup_time, p_order_notes,
    'paid', 'confirmed', p_stripe_session_id, p_stripe_payment_intent
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    customer_name = EXCLUDED.customer_name,
    customer_phone = EXCLUDED.customer_phone,
    customer_email = EXCLUDED.customer_email,
    subtotal_cents = EXCLUDED.subtotal_cents,
    total_cents = EXCLUDED.total_cents,
    discount_cents = EXCLUDED.discount_cents,
    pickup_time = EXCLUDED.pickup_time,
    order_notes = EXCLUDED.order_notes,
    payment_status = EXCLUDED.payment_status,
    status = EXCLUDED.status,
    stripe_session_id = EXCLUDED.stripe_session_id,
    stripe_payment_intent = EXCLUDED.stripe_payment_intent;

  DELETE FROM public.order_items WHERE order_items.order_id = p_order_id;

  INSERT INTO public.order_items (order_id, menu_item_id, name, quantity, unit_price_cents, special_notes)
  SELECT
    p_order_id,
    NULLIF(item->>'menu_item_id', '')::uuid,
    item->>'name',
    (item->>'quantity')::integer,
    (item->>'unit_price_cents')::integer,
    item->>'special_notes'
  FROM jsonb_array_elements(p_items) AS item;

  RETURN QUERY SELECT p_order_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_paid_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_paid_order TO service_role;
