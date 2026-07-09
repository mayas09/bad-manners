-- Root cause: handle_order_picked_up() increments profiles.loyalty_count
-- with `WHERE id = NEW.customer_id`. If that customer has no profiles row
-- yet (e.g. an account created before the on_auth_user_created trigger
-- existed, or any other path that skipped profile creation - see the
-- self-heal comment in src/lib/use-customer-auth.ts), the UPDATE silently
-- matches zero rows: no error is raised, RETURNING gives NULL, and the
-- punch is lost forever with no trace in the logs. The order itself still
-- transitions to picked_up normally, so this was invisible from order
-- history - customers just never accumulate punches.
--
-- Fix: guarantee the profiles row exists (matching the same upsert used by
-- the account page's self-heal) before recording the punch, so the
-- increment can never be silently dropped.
CREATE OR REPLACE FUNCTION public.handle_order_picked_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone integer;
  v_loyalty_count integer;
BEGIN
  IF NEW.status = 'picked_up' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT NULLIF(value, '')::integer INTO v_milestone
    FROM public.business_info WHERE key = 'loyalty_milestone';
    IF v_milestone IS NULL OR v_milestone < 1 THEN
      v_milestone := 5;
    END IF;

    INSERT INTO public.profiles (id)
    VALUES (NEW.customer_id)
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles
    SET loyalty_count = loyalty_count + 1
    WHERE id = NEW.customer_id
    RETURNING loyalty_count INTO v_loyalty_count;

    IF v_loyalty_count IS NOT NULL AND v_loyalty_count >= v_milestone THEN
      UPDATE public.profiles
      SET free_drinks_available = free_drinks_available + 1,
          loyalty_count = 0
      WHERE id = NEW.customer_id;

      INSERT INTO public.notifications (customer_id, order_id, message)
      VALUES (NEW.customer_id, NEW.id, 'You earned a free drink! 🎉');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
