-- Add missing Stripe refund tracking columns to orders (idempotent)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Unique indexes to prevent duplicate Stripe sessions/payments/refunds across orders
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_key
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_key
  ON public.orders (stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_refund_id_key
  ON public.orders (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;
