-- The public homepage and the admin dashboard both now derive their hours
-- display from public.business_settings (the same source as checkout), so the
-- legacy public.business_hours table is unused. Run this once in Supabase.

DROP TABLE IF EXISTS public.business_hours CASCADE;

NOTIFY pgrst, 'reload schema';
