
-- Notifications table (used by NotificationBell)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own notifications" ON public.notifications
    FOR SELECT TO authenticated USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own notifications" ON public.notifications
    FOR UPDATE TO authenticated USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage notifications" ON public.notifications
    FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Catering requests table
CREATE TABLE IF NOT EXISTS public.catering_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_date date,
  event_time time,
  location text,
  guest_count integer,
  notes text,
  budget_range text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catering_requests TO authenticated;
GRANT ALL ON public.catering_requests TO service_role;
ALTER TABLE public.catering_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Customers read own catering requests" ON public.catering_requests
    FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Customers create own catering requests" ON public.catering_requests
    FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins update catering requests" ON public.catering_requests
    FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins delete catering requests" ON public.catering_requests
    FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TRIGGER catering_requests_updated_at
  BEFORE UPDATE ON public.catering_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- On status change, notify the customer
CREATE OR REPLACE FUNCTION public.notify_catering_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE msg text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    msg := CASE NEW.status
      WHEN 'under_review' THEN 'Your catering request is now under review.'
      WHEN 'accepted' THEN 'Your catering request has been accepted! 🖤'
      WHEN 'declined' THEN 'Your catering request was not accepted this time.'
      ELSE 'Your catering request status changed to ' || NEW.status
    END;
    INSERT INTO public.notifications (customer_id, message) VALUES (NEW.customer_id, msg);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER catering_requests_notify
  AFTER UPDATE ON public.catering_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_catering_status_change();
