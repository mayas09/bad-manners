-- Catering status-change notifications insert only (customer_id, message),
-- with no order_id. The column was previously NOT NULL, so every catering
-- notification insert silently failed inside the notify_catering_status_change
-- trigger, meaning catering customers never actually received (or saw) a
-- notification for their request being reviewed/accepted/declined. Relax the
-- constraint so order-less (catering) notifications can be created.
ALTER TABLE public.notifications
  ALTER COLUMN order_id DROP NOT NULL;
