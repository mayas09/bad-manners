-- L-fix: automatically purge analytics_events older than 90 days.
-- Keeps the analytics table from growing indefinitely while preserving recent data.
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.cleanup_old_analytics_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.analytics_events
  WHERE created_at < now() - INTERVAL '90 days';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_analytics_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_analytics_events() TO authenticated;

-- Schedule daily cleanup at 04:00 UTC. Requires pg_cron extension.
-- If pg_cron is not enabled in your project, run the function manually or via an external cron.
SELECT cron.schedule(
  'cleanup-old-analytics-events',
  '0 4 * * *',
  $$ SELECT public.cleanup_old_analytics_events(); $$
);
