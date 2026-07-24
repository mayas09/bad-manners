import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Client sends ONLY identifiers + quantities. Prices, discount, subtotal,
// and total are recomputed server-side from `menu_items` to prevent tampering.
const PickupOrderSchema = z.object({
  orderId: z.string().uuid(),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(1).max(20),
  customerEmail: z.string().email().nullable().optional(),
  pickupTime: z.string().min(1),
  orderNotes: z.string().max(500).nullable().optional(),
  paymentStatus: z.enum(["unpaid", "pay_on_pickup"]),
  redeemFreeDrink: z.boolean(),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        special_notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const placePickupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PickupOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Basic pickup-time guard for a friendly error before the DB trigger runs
    // (the enforce_pickup_time_validity trigger owns hours + slot capacity).
    const pickupDate = new Date(data.pickupTime);
    if (isNaN(pickupDate.getTime())) throw new Error("Invalid pickup time");
    if (pickupDate.getTime() <= Date.now()) {
      throw new Error("Pickup time must be in the future");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const menuIds = Array.from(new Set(data.items.map((it) => it.menu_item_id)));
    const { data: menuRows, error: menuErr } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, price_cents, price, is_sold_out")
      .in("id", menuIds);
    if (menuErr) throw new Error(`Failed to load menu prices: ${menuErr.message}`);
    const priceMap = new Map((menuRows ?? []).map((r) => [r.id, r]));

    // Fallback: parse a single dollar amount from the free-text `price`
    // field (e.g. "$5.50") when price_cents is missing on legacy rows.
    function parsePriceCents(price: string | null | undefined): number | null {
      if (!price) return null;
      const matches = price.match(/\$\s*\d+(?:\.\d+)?/g);
      if (!matches || matches.length !== 1) return null;
      const n = Number(matches[0].replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.round(n * 100);
    }

    type RpcItem = {
      menu_item_id: string;
      name: string;
      quantity: number;
      unit_price_cents: number;
      special_notes: string | null;
    };
    const verifiedItems: RpcItem[] = data.items.map((it) => {
      const row = priceMap.get(it.menu_item_id) as
        | { id: string; name: string; price_cents: number | null; price: string | null; is_sold_out: boolean | null }
        | undefined;
      if (!row) throw new Error(`Item is no longer on the menu`);
      if (row.is_sold_out) throw new Error(`Sold out: ${row.name}`);
      const effective =
        row.price_cents && row.price_cents > 0 ? row.price_cents : parsePriceCents(row.price);
      if (!effective || effective <= 0) {
        throw new Error(`This item can't be ordered online: ${row.name}`);
      }
      return {
        menu_item_id: it.menu_item_id,
        name: row.name,
        quantity: it.quantity,
        unit_price_cents: effective,
        special_notes: it.special_notes ?? null,
      };
    });

    const subtotalCents = verifiedItems.reduce(
      (s, it) => s + it.quantity * it.unit_price_cents,
      0,
    );

    let discountCents = 0;
    let redeem = false;
    if (data.redeemFreeDrink) {
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("free_drinks_available")
        .eq("id", userId)
        .single();
      if (profileErr) throw new Error(`Failed to check reward balance: ${profileErr.message}`);
      if ((profile?.free_drinks_available ?? 0) <= 0) {
        throw new Error("No free drink reward available");
      }
      const cheapest = verifiedItems.reduce(
        (m, it) => (it.unit_price_cents < m ? it.unit_price_cents : m),
        Number.POSITIVE_INFINITY,
      );
      discountCents = Number.isFinite(cheapest) ? cheapest : 0;
      redeem = true;
    }
    const totalCents = Math.max(0, subtotalCents - discountCents);

    // Expand the free-drink line only when the cheapest item has qty>1: split
    // into a paid line (qty-1) and a free line (qty=1 at 0¢). When qty=1 we
    // keep the item as-is at full price — the SQL RPC recomputes subtotal
    // from the paid lines and applies the discount separately, so a $0 total
    // still balances (computed subtotal = discount = cheapest paid line).
    let rpcItems: Omit<RpcItem, never>[] = verifiedItems;
    if (redeem && discountCents > 0) {
      const cheapestIdx = verifiedItems.reduce(
        (best, it, idx) =>
          it.unit_price_cents < verifiedItems[best].unit_price_cents ? idx : best,
        0,
      );
      const cheapest = verifiedItems[cheapestIdx];
      if (cheapest.quantity > 1) {
        rpcItems = verifiedItems.flatMap((it, idx) => {
          if (idx !== cheapestIdx) return [it];
          return [
            { ...it, quantity: it.quantity - 1 },
            { ...it, quantity: 1, unit_price_cents: 0 },
          ];
        });
      }
    }

    const { data: rpcData, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)("place_pickup_order", {
      p_customer_name: data.customerName,
      p_customer_phone: data.customerPhone,
      p_customer_email: data.customerEmail ?? null,
      p_subtotal_cents: subtotalCents,
      p_total_cents: totalCents,
      p_discount_cents: discountCents,
      p_pickup_time: data.pickupTime,
      p_order_notes: data.orderNotes ?? null,
      p_payment_status: data.paymentStatus,
      p_redeem_free_drink: redeem,
      p_items: rpcItems,
    });

    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | { order_id: string; order_number: number }
      | undefined;
    if (!row?.order_id) throw new Error("Order could not be created");
    return { orderId: row.order_id, orderNumber: row.order_number };
  });
