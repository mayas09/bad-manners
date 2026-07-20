-- M-fix: server-side validation of orders.pickup_time.
-- Prevents clients from bypassing the UI picker and booking pickups in the
-- past, far in the future, or off-hours. Adjust the business hours window
-- (OPEN_HOUR/CLOSE_HOUR, in local restaurant time) to match reality.
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_pickup_time_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pickup_local TIMESTAMPTZ;
  local_hour INTEGER;
  local_minute INTEGER;
  OPEN_HOUR CONSTANT INTEGER := 8;   -- 08:00
  CLOSE_HOUR CONSTANT INTEGER := 22; -- 22:00 (last slot at 21:45)
  MAX_DAYS_AHEAD CONSTANT INTEGER := 14;
BEGIN
  -- Admins bypass.
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.pickup_time IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Reject past pickups (allow a small 2-minute grace window for clock skew).
  IF NEW.pickup_time < now() - INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'Pickup time is in the past. Please select a later slot.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reject pickups too far in the future.
  IF NEW.pickup_time > now() + (MAX_DAYS_AHEAD || ' days')::INTERVAL THEN
    RAISE EXCEPTION 'Pickup time is too far in the future.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Must land on a 15-minute boundary.
  IF EXTRACT(MINUTE FROM NEW.pickup_time)::INTEGER % 15 <> 0
     OR EXTRACT(SECOND FROM NEW.pickup_time)::INTEGER <> 0 THEN
    RAISE EXCEPTION 'Pickup time must be on a 15-minute slot.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Enforce business hours in the restaurant's local timezone.
  pickup_local := NEW.pickup_time AT TIME ZONE 'America/New_York';
  local_hour := EXTRACT(HOUR FROM pickup_local)::INTEGER;
  local_minute := EXTRACT(MINUTE FROM pickup_local)::INTEGER;

  IF local_hour < OPEN_HOUR
     OR local_hour > CLOSE_HOUR
     OR (local_hour = CLOSE_HOUR AND local_minute > 0) THEN
    RAISE EXCEPTION 'Pickup time is outside business hours.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_pickup_time_validity() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_pickup_time_validity_insert ON public.orders;
CREATE TRIGGER enforce_pickup_time_validity_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pickup_time_validity();

DROP TRIGGER IF EXISTS enforce_pickup_time_validity_update ON public.orders;
CREATE TRIGGER enforce_pickup_time_validity_update
  BEFORE UPDATE OF pickup_time ON public.orders
  FOR EACH ROW
  WHEN (NEW.pickup_time IS DISTINCT FROM OLD.pickup_time)
  EXECUTE FUNCTION public.enforce_pickup_time_validity();
