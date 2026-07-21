-- Delete read notifications older than 30 days, unread older than 90 days.
-- Keeps notifications table lean without losing recent unread items.

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.notifications
  WHERE (read_at IS NOT NULL AND read_at < now() - INTERVAL '30 days')
     OR (read_at IS NULL AND created_at < now() - INTERVAL '90 days');
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-old-notifications')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-notifications');
    PERFORM cron.schedule(
      'cleanup-old-notifications',
      '15 4 * * *',
      'SELECT public.cleanup_old_notifications();'
    );
  END IF;
END;
$do$;
