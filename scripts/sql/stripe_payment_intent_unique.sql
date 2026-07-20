-- M-fix: enforce uniqueness of Stripe identifiers on public.orders.
-- Blocks a class of race-condition / replay bugs where the same Stripe
-- session or payment_intent could be attached to two different orders.
-- Complements idempotency in record_paid_order().
-- Apply once in the Supabase SQL editor.

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_key
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_key
  ON public.orders (stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_refund_id_key
  ON public.orders (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;
