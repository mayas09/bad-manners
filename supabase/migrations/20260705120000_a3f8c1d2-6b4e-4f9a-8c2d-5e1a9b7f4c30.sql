-- Update the declined-request notification copy to invite customers to
-- reach out for other dates. This only replaces the function body; the
-- existing catering_requests_notify trigger keeps pointing at this
-- function by name, so it is left untouched.
CREATE OR REPLACE FUNCTION public.notify_catering_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE msg text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    msg := CASE NEW.status
      WHEN 'under_review' THEN 'Your catering request is now under review.'
      WHEN 'accepted' THEN 'Your catering request has been accepted! 🖤'
      WHEN 'declined' THEN 'Your catering request was not accepted this time. Feel free to reach out for other dates!'
      ELSE 'Your catering request status changed to ' || NEW.status
    END;
    INSERT INTO public.notifications (customer_id, message) VALUES (NEW.customer_id, msg);
  END IF;
  RETURN NEW;
END; $$;
