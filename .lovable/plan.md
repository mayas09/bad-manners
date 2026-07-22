
## Plan — apply the fix pack (with corrections)

I'll execute all fixes from the uploaded prompt, with the following adjustments where the prompt doesn't match this codebase:

### Adjustments to flag

1. **Fix #2 (auth middleware) — email verification check will lock out existing users.**
   The prompt asks to throw if `!email_confirmed_at`. Signup email confirmation was only enabled recently; existing customer accounts may not be confirmed and would immediately be locked out of the site (checkout, account, favorites). I will:
   - Swap `getClaims(token)` → `getUser(token)` (real signature/expiry verification). ✅
   - **Skip** the hard `email_confirmed_at` throw. If you want it enforced, say so and I'll add it as a separate step with a data-check first.
   - Note: `auth-middleware.ts` header says "automatically generated" — I'll still edit it since the generator is Lovable Cloud which we've decoupled from.

2. **Fix #3 (business hours validation) — `business_hours` table doesn't exist.**
   Store hours live in `app_settings` (see `store_hours_from_app_settings.sql`), and the DB trigger `enforce_pickup_time_validity` already validates: future time + within business hours + 15-min slot capacity. Server-side JS re-validation would duplicate and drift. I will:
   - Rely on the existing DB trigger (already enforced atomically inside `place_pickup_order`).
   - Add only a lightweight "pickup must be in the future" guard in the server fn for a nicer error message before the RPC.

3. **Fix H4 — `context.claims` doesn't carry role.**
   Roles live in `user_roles`. I'll switch the admin check in `cancelOrderWithRefund` to `supabaseAdmin.from('user_roles')` (bypasses RLS misconfig risk), as the prompt's primary option suggests.

### Fixes applied as specified

- **C1 — `placePickupOrder` server-side price recomputation**
  - New Zod schema: client sends only `{menu_item_id, quantity, special_notes}` per item (no prices).
  - Handler fetches `menu_items` (id, price_cents, is_sold_out, name) via `supabaseAdmin`, rejects sold-out/missing items, recomputes subtotal, verifies `free_drinks_available` from `profiles`, computes discount = cheapest item price, computes total.
  - Passes server-computed values to `place_pickup_order` RPC.
  - Update `src/routes/checkout.tsx` to stop sending prices; keep UI display prices from the cart context.

- **C2 — auth middleware**: `getClaims` → `getUser(token)` with proper error handling.

- **C3 — pickup time**: server-side "future time" guard; DB trigger handles hours/slot capacity.

- **H1 — Stripe idempotency**: pass `{ idempotencyKey: 'checkout-session-<orderId>' }` (stable — no `Date.now()`, which defeats idempotency) to `stripe.checkout.sessions.create`.

- **H2 — Stripe coupon cleanup**: `await stripe.coupons.del(coupon.id)` after session creation, wrapped so a cleanup failure doesn't fail the checkout.

- **H3 — `cancelOrderWithRefund` race**: pre-read + conditional update `.neq('status','cancelled')`, throw if 0 rows affected; use `supabaseAdmin` throughout.

- **H4 — admin check via `supabaseAdmin`** in `cancelOrderWithRefund`.

- **M1 — `useSiteContent` error handling**: check `.error` on each of the 4 parallel queries; on any error, log and set `loaded: false` instead of showing stale data as loaded.

- **M2 — gallery merge**: `themedRows.length > 0 ? [...themedRows, ...defaultRows].slice(0, 6) : defaultRows`.

- **M3 — seasonal timezone**: use `getSiteDateParts(new Date()).month` instead of `new Date().getMonth() + 1`.

- **L1 — CSS typo**: `ransform:` → `transform:` on `.tilt-card:hover` in `src/styles.css`.

- **L2 — Lovable branding**: add safe fallback in `src/lib/lovable-error-reporting.ts` when `window.__lovableEvents` is missing. I'll **leave `AGENTS.md`** in the repo (it's dev-only guidance, not shipped to users) unless you want it deleted.

- **L3 — error page branding**: apply Bad Manners palette/fonts (`bg-[--bg]`, fire/pink accents, display font) to `src/lib/error-page.ts`.

### Files to modify
- `src/lib/pickup-order.functions.ts` (rewrite)
- `src/routes/checkout.tsx` (stop sending prices)
- `src/integrations/supabase/auth-middleware.ts`
- `src/lib/checkout.functions.ts` (idempotency, coupon cleanup, race fix, admin check)
- `src/components/site/use-site-content.ts`
- `src/styles.css`
- `src/lib/lovable-error-reporting.ts`
- `src/lib/error-page.ts`

### Not changing
- Stripe keys / test mode.
- Business logic (menu, prices, hours).
- `AGENTS.md` (dev-only file; say the word and I'll delete it).
- Email-verified hard gate in middleware (see Adjustment #1).

Confirm and I'll implement.
