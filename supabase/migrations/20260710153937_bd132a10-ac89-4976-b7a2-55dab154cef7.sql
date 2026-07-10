ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.site_images
  ADD COLUMN IF NOT EXISTS season_tag text,
  ADD COLUMN IF NOT EXISTS month_tag integer;