-- M-fix: hard caps on order totals to blunt abuse / accidental huge orders.
-- Non-admin inserts are limited to $500 total and 50 line-item units.
-- Apply once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_order_size_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  MAX_TOTAL_CENTS CONSTANT INTEGER := 50000; -- $500.00
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.total_cents IS NOT NULL AND NEW.total_cents > MAX_TOTAL_CENTS THEN
    RAISE EXCEPTION 'Order total exceeds the online limit ($%). Please contact us for large orders.',
      (MAX_TOTAL_CENTS / 100)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_order_size_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_order_size_limits ON public.orders;
CREATE TRIGGER enforce_order_size_limits
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_size_limits();

-- Cap items per order (max 20 distinct line items, max 20 units per item)
CREATE OR REPLACE FUNCTION public.enforce_order_item_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line_count INTEGER;
  MAX_LINES CONSTANT INTEGER := 20;
  MAX_QTY CONSTANT INTEGER := 20;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity > MAX_QTY THEN
    RAISE EXCEPTION 'Quantity per item is limited to %.', MAX_QTY
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO line_count
  FROM public.order_items
  WHERE order_id = NEW.order_id;

  IF line_count >= MAX_LINES THEN
    RAISE EXCEPTION 'Orders are limited to % distinct items.', MAX_LINES
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_order_item_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_order_item_limits ON public.order_items;
CREATE TRIGGER enforce_order_item_limits
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_item_limits();
