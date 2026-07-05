
-- Lock down SECURITY DEFINER function
REVOKE ALL ON FUNCTION public.notify_catering_status_change() FROM PUBLIC, anon, authenticated;

-- Add missing loyalty columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS loyalty_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_drinks_available integer NOT NULL DEFAULT 0;

-- Add discount to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
