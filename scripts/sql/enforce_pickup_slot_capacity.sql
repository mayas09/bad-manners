-- M-fix: cap active orders per 15-minute pickup slot to prevent overbooking.
-- Default cap: 6 orders per slot (adjust MAX_PER_SLOT below to fit kitchen throughput).
-- Runs on INSERT and on UPDATE of pickup_time. Ignores cancelled/refunded orders.
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_pickup_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot_count INTEGER;
  MAX_PER_SLOT CONSTANT INTEGER := 6;
BEGIN
  -- Admins bypass (allows manual overrides from the dashboard).
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.pickup_time IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO slot_count
  FROM public.orders
  WHERE pickup_time = NEW.pickup_time
    AND status <> 'cancelled'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF slot_count >= MAX_PER_SLOT THEN
    RAISE EXCEPTION 'This pickup time is fully booked. Please pick another slot.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_pickup_slot_capacity() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_pickup_slot_capacity_insert ON public.orders;
CREATE TRIGGER enforce_pickup_slot_capacity_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pickup_slot_capacity();

DROP TRIGGER IF EXISTS enforce_pickup_slot_capacity_update ON public.orders;
CREATE TRIGGER enforce_pickup_slot_capacity_update
  BEFORE UPDATE OF pickup_time ON public.orders
  FOR EACH ROW
  WHEN (NEW.pickup_time IS DISTINCT FROM OLD.pickup_time)
  EXECUTE FUNCTION public.enforce_pickup_slot_capacity();
