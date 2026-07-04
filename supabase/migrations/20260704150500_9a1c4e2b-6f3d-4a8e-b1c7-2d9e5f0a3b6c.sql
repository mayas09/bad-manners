-- Punch-card loyalty system: earn a free drink every N picked-up orders.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS loyalty_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_drinks_available integer NOT NULL DEFAULT 0;

INSERT INTO public.business_info (key, value)
VALUES ('loyalty_milestone', '5')
ON CONFLICT (key) DO NOTHING;

-- Tracks the discount (if any) applied to an order for a redeemed free drink,
-- so receipts/admin can show what was waived. total_cents already reflects it.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;

-- Award a punch (and a free drink at the milestone) when an order is picked up.
CREATE OR REPLACE FUNCTION public.handle_order_picked_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone integer;
  v_loyalty_count integer;
BEGIN
  IF NEW.status = 'picked_up' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT NULLIF(value, '')::integer INTO v_milestone
    FROM public.business_info WHERE key = 'loyalty_milestone';
    IF v_milestone IS NULL OR v_milestone < 1 THEN
      v_milestone := 5;
    END IF;

    UPDATE public.profiles
    SET loyalty_count = loyalty_count + 1
    WHERE id = NEW.customer_id
    RETURNING loyalty_count INTO v_loyalty_count;

    IF v_loyalty_count IS NOT NULL AND v_loyalty_count >= v_milestone THEN
      UPDATE public.profiles
      SET free_drinks_available = free_drinks_available + 1,
          loyalty_count = 0
      WHERE id = NEW.customer_id;

      INSERT INTO public.notifications (customer_id, order_id, message)
      VALUES (NEW.customer_id, NEW.id, 'You earned a free drink! 🎉');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_order_picked_up() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_picked_up_loyalty ON public.orders;
CREATE TRIGGER trg_order_picked_up_loyalty
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_picked_up();

-- Guard profiles.loyalty_count / free_drinks_available from arbitrary client edits.
-- Customers may only self-service redeem a free drink (decrement by exactly 1,
-- never below 0); admins/service_role (trusted server-side + the trigger above)
-- may set them freely.
CREATE OR REPLACE FUNCTION public.enforce_customer_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.loyalty_count IS DISTINCT FROM OLD.loyalty_count THEN
    RAISE EXCEPTION 'Customers cannot modify loyalty_count directly';
  END IF;

  IF NEW.free_drinks_available IS DISTINCT FROM OLD.free_drinks_available THEN
    IF NEW.free_drinks_available IS DISTINCT FROM (OLD.free_drinks_available - 1)
       OR NEW.free_drinks_available < 0 THEN
      RAISE EXCEPTION 'Customers may only redeem one free drink at a time';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_customer_profile_update_trg ON public.profiles;
CREATE TRIGGER enforce_customer_profile_update_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_customer_profile_update();
