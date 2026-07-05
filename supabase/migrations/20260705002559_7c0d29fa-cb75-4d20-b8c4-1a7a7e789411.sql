
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'pay_on_pickup';

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;
