-- Remove the broken Stripe order finalization RPC. Paid Stripe orders are now
-- finalized in application code after retrieving and verifying the Checkout
-- Session.
DROP FUNCTION IF EXISTS public.finalize_paid_order(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  text,
  text,
  text,
  jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_id_unique
  ON public.orders(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.finalize_paid_order(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  timestamptz,
  text,
  text,
  text,
  jsonb
);
