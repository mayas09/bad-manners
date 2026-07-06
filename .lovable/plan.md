
# Backend Audit & Enhancement Plan

This is a large, multi-part backend + feature build. I'll ship it in one coordinated pass, grouped by concern. No public UI redesign — only additive UI where new features require it (heart icon on menu cards, discount badge, admin analytics/discount controls, resend-confirmation on login).

## 1. Database migration (single SQL migration)

Verify existing tables, add missing ones, all with RLS + GRANTs.

**New tables:**
- `categories` (id, name, slug, sort_order, timestamps)
- `product_images` (id, menu_item_id FK, url, sort_order, timestamps)
- `favorites` (id, customer_id FK profiles, menu_item_id FK, created_at, unique pair)
- `receipts` (id, order_id FK, customer_id FK, receipt_number text unique, created_at)
- `analytics_events` (id, event_type, customer_id, menu_item_id, order_id, value_cents, created_at) — named `analytics_events` to avoid reserved-ish name
- `app_settings` (id, key unique, value jsonb, updated_at)
- `inventory` (id, menu_item_id FK unique, available bool default true, updated_at)

**menu_items additions:**
- `original_price_cents` int nullable
- `discount_type` text nullable ('percent' | 'amount')
- `discount_value` numeric nullable
(Keep existing `price_cents` as final customer-facing price.)

**RLS pattern:**
- favorites: owner-only read/write via `auth.uid() = customer_id`; admins full
- receipts: owner read + admin read; insert via trigger/server
- analytics_events: admin read; insert allowed for authenticated (own rows)
- app_settings, inventory, categories, product_images: public read, admin write

**Triggers:**
- On `orders` insert → insert analytics_events (event `order_created`, value = total_cents)
- On `orders` update where status→picked_up → insert analytics_events (event `sale_completed`)
- On `orders` insert → auto-create `receipts` row with `BMC-{order_number padded}`

## 2. Storage buckets

Create via storage tool: `products` (public), `users` (private), `gallery` (public), `banners` (public). Keep `site-images`. **Do not** attempt to bulk-move existing images — that requires copying binaries. Instead: new uploads go to the new buckets; existing image_urls continue to work. Note this to user.

## 3. Auth — email confirmation

- Call `configure_auth` with `auto_confirm_email: false`, keep `password_hibp_enabled: true`.
- Signup page: show "Check your email to confirm 🖤" message after signup submit.
- Login page: on error "Email not confirmed", show "Resend confirmation email" button calling `supabase.auth.resend({ type: 'signup', email })`.
- Verify existing flows (already implemented per prior turns).

## 4. Favorites

- Heart button on each menu item card in `src/routes/index.tsx` (top-right of image area). Signed-out users: clicking opens login. Signed-in: toggles favorite.
- New `src/lib/favorites.functions.ts` server functions (`toggleFavorite`, `listFavorites`).
- `/account` gains a "My Favorites" section listing favorited items with Add-to-Cart.

## 5. Analytics admin page

- New route `src/routes/admin.analytics.tsx`.
- Server fn `getAnalyticsSummary` (admin-gated) returns: revenue (today/week/month), order counts, top 5 items via order_items aggregation, new customers counts.
- Add link in admin sidebar (`src/routes/admin.tsx`).

## 6. Discount system

- `admin.menu.tsx`: per-row fields — original price, discount type toggle (%/$), discount value, live preview "Customer sees: $X.XX (was $Y.YY)". Save recomputes `price_cents`.
- Public menu (`src/routes/index.tsx`): if `original_price_cents` > `price_cents`, render strikethrough original + pink final + hot-pink badge `-20%` / `-$1.50` positioned top-right of card image.
- `use-site-content.ts` and `menu-data.ts` extended with discount fields.

## Technical notes

- All server fns use `requireSupabaseAuth` + `has_role` check for admin ones.
- Analytics triggers use `SECURITY DEFINER` to write regardless of caller RLS.
- Receipts row auto-created; the existing receipt page can start reading from it (or continue computing on the fly — keep both paths working).
- No changes to existing hero/menu/layout design or copy.

## Not doing (explicit)

- Not bulk-migrating existing storage bucket contents (destructive, would break current URLs). New uploads use new buckets going forward.
- Not adding product_view tracking on the public menu (spec says optional; adds render cost). Can add later.
- Not renaming existing `catering_inquiries` (kept alongside `catering_requests`).

Approve and I'll execute the full migration + code changes.
