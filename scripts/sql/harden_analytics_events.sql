-- Prevent client-side spoofing of analytics_events:
--   * Force customer_id = auth.uid() (or NULL for anon).
--   * Reject event_type values outside a known whitelist.
--   * Rate-limit inserts per user.
-- Admins bypass.

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
    -- Force customer_id to match the caller (NULL for anon).
    NEW.customer_id := auth.uid();

    IF NEW.event_type IS NULL OR NOT (NEW.event_type = ANY (allowed_types)) THEN
      RAISE EXCEPTION 'Invalid analytics event_type: %', NEW.event_type;
    END IF;

    -- Simple rate limit: max 60 events per user per minute.
    IF NEW.customer_id IS NOT NULL THEN
      IF (SELECT count(*) FROM public.analytics_events
          WHERE customer_id = NEW.customer_id
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

CREATE INDEX IF NOT EXISTS analytics_events_customer_recent_idx
  ON public.analytics_events (customer_id, created_at DESC);
