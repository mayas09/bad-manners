-- Loyalty punch-card fix.
-- Awards exactly one punch when an eligible order moves to picked_up.
-- Re-running this script is safe: already-awarded orders are marked by
-- orders.loyalty_awarded_at and will not be counted twice.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS loyalty_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_drinks_available integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_awarded_at timestamptz;

-- Read the admin-configured milestone from business_info. Fallback is 4 so
-- the database still behaves sensibly if the setting row is missing.
CREATE OR REPLACE FUNCTION public.current_loyalty_milestone()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(
    1,
    coalesce(
      (
        SELECT CASE
          WHEN trim(value) ~ '^[0-9]+$' THEN trim(value)::integer
          ELSE NULL
        END
        FROM public.business_info
        WHERE key = 'loyalty_milestone'
        LIMIT 1
      ),
      4
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_loyalty_milestone() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.increment_customer_loyalty(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone integer;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  v_milestone := public.current_loyalty_milestone();

  INSERT INTO public.profiles (id, loyalty_count, free_drinks_available, updated_at)
  VALUES (p_customer_id, (1 % v_milestone), (1 / v_milestone), now())
  ON CONFLICT (id) DO UPDATE
    SET loyalty_count = ((coalesce(public.profiles.loyalty_count, 0) + 1) % v_milestone),
        free_drinks_available = coalesce(public.profiles.free_drinks_available, 0)
          + ((coalesce(public.profiles.loyalty_count, 0) + 1) / v_milestone),
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_customer_loyalty(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.award_loyalty_on_picked_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'picked_up'
     AND NEW.payment_status IN ('paid', 'pay_on_pickup')
     AND NEW.loyalty_awarded_at IS NULL THEN
    PERFORM public.increment_customer_loyalty(NEW.customer_id);
    NEW.loyalty_awarded_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_loyalty_on_picked_up() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_award_loyalty_on_picked_up ON public.orders;
CREATE TRIGGER trg_award_loyalty_on_picked_up
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.award_loyalty_on_picked_up();

-- Repair already-picked-up orders that missed the punch-card update before
-- this trigger existed. This block is idempotent because it marks each order.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, customer_id
    FROM public.orders
    WHERE status = 'picked_up'
      AND payment_status IN ('paid', 'pay_on_pickup')
      AND loyalty_awarded_at IS NULL
    ORDER BY updated_at ASC, created_at ASC
  LOOP
    PERFORM public.increment_customer_loyalty(r.customer_id);
    UPDATE public.orders
      SET loyalty_awarded_at = now(), updated_at = now()
      WHERE id = r.id
        AND loyalty_awarded_at IS NULL;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';