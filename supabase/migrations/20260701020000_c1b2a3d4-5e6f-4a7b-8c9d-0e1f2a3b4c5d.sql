
-- Seed the real production menu, hours, and business info so the public site
-- and checkout flow read live data from Supabase instead of client-side fallbacks.

INSERT INTO public.menu_items (section, name, price, price_cents, note, is_gf_v, sort_order) VALUES
  ('coffee', 'Drip', '$3.75', 375, NULL, false, 1),
  ('coffee', 'Cold Brew', '$4.50', 450, NULL, false, 2),
  ('coffee', 'Americano', '$4', 400, NULL, false, 3),
  ('coffee', 'Espresso', '$4', 400, NULL, false, 4),
  ('coffee', 'Cortado', '$4.50', 450, NULL, false, 5),
  ('coffee', 'Cappuccino', '$4.75', 475, NULL, false, 6),
  ('coffee', 'Latte', '$5.50', 550, NULL, false, 7),
  ('coffee', 'Espresso & Tonic', '$5', 500, NULL, false, 8),
  ('non-coffee', 'Golden Milk Latte', '$5.50', 550, NULL, false, 1),
  ('non-coffee', 'Chai Latte', '$5.50', 550, NULL, false, 2),
  ('non-coffee', 'Matcha Latte', '$5.50', 550, NULL, false, 3),
  ('non-coffee', 'London Fog', '$5.50', 550, NULL, false, 4),
  ('non-coffee', 'Hot Chocolate', '$4 / $5', NULL, NULL, false, 5),
  ('tea', 'Ambrosia Black', NULL, NULL, 'Tasting Notes: Hawthorn Berries, Baked Peach, Mead', true, 1),
  ('tea', 'Crescent Green', NULL, NULL, 'Tasting Notes: Sandalwood, Apricot, Honeycomb', true, 2),
  ('tea', 'Sunstone Black', NULL, NULL, 'Tasting Notes: Honey, Dark Cocoa, Apricot', true, 3),
  ('tea', 'Malabar Herbal', NULL, NULL, 'Tasting Notes: Ginger, Malabar Black Peppercorn, Turmeric, Lemongrass, Licorice Root', true, 4),
  ('tea', 'Rosella Herbal Tonic', NULL, NULL, 'Tasting Notes: Hibiscus, Lemongrass, Licorice Root', true, 5),
  ('seasonal', 'Cold Brew Lemonade', '$6.00', 600, 'House-made sparkling lemonade topped with cold brew concentrate (Iced, 12oz, GF/V)', true, 1),
  ('seasonal', 'Matcho Matcha Man', '$6.00', 600, 'House-made sparkling lemonade, lavender syrup, topped with matcha (Iced, 12oz, GF/V)', true, 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.business_hours (label, hours_text, sort_order) VALUES
  ('Mon – Fri', '8:00 AM – 3:00 PM', 1),
  ('Sat – Sun', '8:30 AM – 3:00 PM', 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.business_info (key, value) VALUES
  ('address_line1', '697 Haywood Rd, Suite G'),
  ('address_line2', 'Asheville, NC 28806'),
  ('instagram_url', 'https://instagram.com/badmannerscoffee'),
  ('facebook_url', 'https://facebook.com/badmannerscoffee'),
  ('gift_card_url', 'https://squareup.com/gift/bad-manners-coffee/order'),
  ('map_query', '697 Haywood Rd G Asheville NC 28806')
ON CONFLICT (key) DO NOTHING;
