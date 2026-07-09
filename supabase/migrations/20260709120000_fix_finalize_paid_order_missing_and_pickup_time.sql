-- finalize_paid_order was missing from the live database (the schema-cache
-- error "Could not find the function public.finalize_paid_order(...)" seen
-- during Stripe checkout), so recreate it here to guarantee it exists.
--
-- This also fixes two latent bugs carried over from the prior definition,
-- confirmed by exercising this exact function body against real table
-- shapes before this migration was written:
--
-- 1. p_pickup_time is passed in as text (an ISO timestamp string from the
--    client), but orders.pickup_time is timestamptz. Postgres has no
--    text -> timestamptz cast, so the INSERT would fail with
--    "column \"pickup_time\" is of type timestamp with time zone but
--    expression is of type text" as soon as this function was actually
--    invoked. Casting explicitly with ::timestamptz fixes this.
--
-- 2. RETURNS TABLE(id uuid, ...) declares an output parameter named "id",
--    which collides with the bare "id" column reference in
--    "INSERT INTO orders (id, ...) ... ON CONFLICT (id)" below, raising
--    "column reference \"id\" is ambiguous" on every call. Renaming the
--    output column to result_id removes the collision; callers only ever
--    read the `error` field from the rpc() call today, not the row shape,
--    so this rename is not a breaking change.
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
RETURNS TABLE(result_id uuid, already_paid boolean)
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
    p_subtotal_cents, p_total_cents, p_discount_cents, p_pickup_time::timestamptz, p_order_notes,
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
