-- Prevent client-side spoofing of analytics_events:
--   * Force user_id = auth.uid() (or NULL for anon).
--   * Reject event_type values outside a known whitelist.
--   * Cap payload size and rate.
-- Admins/service_role bypass.

-- 1. Trigger that overwrites user_id from JWT and validates event_type.
CREATE OR REPLACE FUNCTION public.sanitize_analytics_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  allowed_types text[] := ARRAY[
    'page_view', 'menu_view', 'item_view', 'add_to_cart',
    'checkout_start', 'checkout_complete', 'order_created',
    'order_completed', 'signup', 'login', 'favorite_add', 'favorite_remove'
  ];
  is_admin boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    is_admin := public.has_role(auth.uid(), 'admin');
  END IF;

  IF NOT is_admin THEN
    -- Force user_id to match the caller.
    NEW.user_id := auth.uid();

    IF NEW.event_type IS NULL OR NOT (NEW.event_type = ANY (allowed_types)) THEN
      RAISE EXCEPTION 'Invalid analytics event_type: %', NEW.event_type;
    END IF;

    IF NEW.payload IS NOT NULL AND octet_length(NEW.payload::text) > 4096 THEN
      RAISE EXCEPTION 'Analytics payload too large (max 4KB)';
    END IF;

    -- Simple rate limit: max 60 events per user per minute.
    IF NEW.user_id IS NOT NULL THEN
      IF (SELECT count(*) FROM public.analytics_events
          WHERE user_id = NEW.user_id
            AND created_at > now() - INTERVAL '1 minute') >= 60 THEN
        RAISE EXCEPTION 'Analytics rate limit exceeded';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.sanitize_analytics_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sanitize_analytics_event ON public.analytics_events;
CREATE TRIGGER trg_sanitize_analytics_event
  BEFORE INSERT ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_analytics_event();

-- 2. Index for the rate-limit lookup.
CREATE INDEX IF NOT EXISTS analytics_events_user_recent_idx
  ON public.analytics_events (user_id, created_at DESC);
