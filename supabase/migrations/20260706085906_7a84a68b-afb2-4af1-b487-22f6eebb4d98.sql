
-- 1) menu_items new columns
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS original_price_cents integer,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent','amount')),
  ADD COLUMN IF NOT EXISTS discount_value numeric;

-- 2) categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories readable by all" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories admin write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3) product_images
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_images readable by all" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "product_images admin write" ON public.product_images FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) favorites
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, menu_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites owner read" ON public.favorites FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "favorites owner insert" ON public.favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "favorites owner delete" ON public.favorites FOR DELETE TO authenticated
  USING (auth.uid() = customer_id);

-- 5) receipts
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  receipt_number text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipts owner or admin" ON public.receipts FOR SELECT TO authenticated
  USING (auth.uid() = customer_id OR public.has_role(auth.uid(),'admin'));

-- 6) analytics_events
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  customer_id uuid,
  menu_item_id uuid,
  order_id uuid,
  value_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics admin read" ON public.analytics_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 7) app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings public read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings admin write" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 8) inventory
CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL UNIQUE REFERENCES public.menu_items(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory public read" ON public.inventory FOR SELECT USING (true);
CREATE POLICY "inventory admin write" ON public.inventory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 9) Triggers on orders: create receipt + analytics
CREATE OR REPLACE FUNCTION public.on_order_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.receipts (order_id, customer_id, receipt_number)
  VALUES (NEW.id, NEW.customer_id, 'BMC-' || lpad(NEW.order_number::text, 6, '0'))
  ON CONFLICT (order_id) DO NOTHING;

  INSERT INTO public.analytics_events (event_type, customer_id, order_id, value_cents)
  VALUES ('order_created', NEW.customer_id, NEW.id, NEW.total_cents);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_on_order_created ON public.orders;
CREATE TRIGGER trg_on_order_created AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.on_order_created();

CREATE OR REPLACE FUNCTION public.on_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'picked_up' AND OLD.status IS DISTINCT FROM 'picked_up' THEN
    INSERT INTO public.analytics_events (event_type, customer_id, order_id, value_cents)
    VALUES ('sale_completed', NEW.customer_id, NEW.id, NEW.total_cents);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_on_order_status_change ON public.orders;
CREATE TRIGGER trg_on_order_status_change AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.on_order_status_change();

-- Backfill receipts for existing orders
INSERT INTO public.receipts (order_id, customer_id, receipt_number, created_at)
SELECT o.id, o.customer_id, 'BMC-' || lpad(o.order_number::text, 6, '0'), o.created_at
FROM public.orders o
LEFT JOIN public.receipts r ON r.order_id = o.id
WHERE r.id IS NULL;
