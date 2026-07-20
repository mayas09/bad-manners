-- M-fix: centralize store hours in app_settings and enforce them server-side.
-- The pickup-time trigger reads open/close minutes from app_settings instead of
-- hard-coded constants, so changing hours no longer requires editing SQL.
-- Apply once in the Supabase SQL editor.

-- 1) Seed store-hours settings (minutes from midnight, America/New_York).
-- Default: 8:00 AM - 3:00 PM to match current business_hours.
INSERT INTO public.app_settings (key, value) VALUES
  ('store_open_minute', '480'),   -- 08:00
  ('store_close_minute', '900'),  -- 15:00
  ('store_timezone', '"America/New_York"'),
  ('store_max_days_ahead', '14')
ON CONFLICT (key) DO NOTHING;

-- 2) Helper to read an integer setting with a fallback.
CREATE OR REPLACE FUNCTION public.get_int_setting(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value::text)::integer, p_default)
  FROM public.app_settings
  WHERE key = p_key
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_int_setting(text, integer) FROM PUBLIC;

-- 3) Replace the pickup-time trigger to use app_settings.
CREATE OR REPLACE FUNCTION public.enforce_pickup_time_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz text;
  open_min integer;
  close_min integer;
  max_days integer;
  pickup_local timestamptz;
  local_minutes integer;
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

  tz := public.get_int_setting('store_timezone', 'America/New_York')::text;
  open_min := public.get_int_setting('store_open_minute', 480);
  close_min := public.get_int_setting('store_close_minute', 900);
  max_days := public.get_int_setting('store_max_days_ahead', 14);

  -- Reject pickups too far in the future.
  IF NEW.pickup_time > now() + (max_days || ' days')::INTERVAL THEN
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
  pickup_local := NEW.pickup_time AT TIME ZONE tz;
  local_minutes := EXTRACT(HOUR FROM pickup_local)::INTEGER * 60
                 + EXTRACT(MINUTE FROM pickup_local)::INTEGER;

  IF local_minutes < open_min OR local_minutes >= close_min THEN
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
