-- M-fix: rate-limit anonymous submissions to catering_inquiries.
-- Prevents a single email or phone from flooding admin inbox.
-- Enforces: max 3 inquiries per email OR phone in any 10-minute window.
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_catering_inquiry_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
  window_start TIMESTAMPTZ := now() - INTERVAL '10 minutes';
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.catering_inquiries
  WHERE created_at >= window_start
    AND (
      (NEW.email IS NOT NULL AND lower(email) = lower(NEW.email))
      OR (NEW.phone IS NOT NULL AND NEW.phone <> '' AND phone = NEW.phone)
    );

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Too many inquiries submitted recently. Please wait a few minutes and try again.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_catering_inquiry_rate_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_catering_inquiry_rate_limit ON public.catering_inquiries;
CREATE TRIGGER enforce_catering_inquiry_rate_limit
  BEFORE INSERT ON public.catering_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_catering_inquiry_rate_limit();
