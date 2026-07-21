import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PickupOrderSchema = z.object({
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(1).max(20),
  customerEmail: z.string().email().nullable().optional(),
  subtotalCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  pickupTime: z.string().min(1),
  orderNotes: z.string().max(500).nullable().optional(),
  paymentStatus: z.enum(["unpaid", "pay_on_pickup"]),
  redeemFreeDrink: z.boolean(),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().nullable().optional(),
        name: z.string().min(1).max(200),
        quantity: z.number().int().min(1).max(99),
        unit_price_cents: z.number().int().min(0),
        special_notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * H3 fix: atomically insert order + order_items + optional free-drink redemption
 * via the `place_pickup_order` Postgres function. Replaces the 3-step client
 * insert previously in `src/routes/checkout.tsx`.
 */
export const placePickupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PickupOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: rpcData, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>)("place_pickup_order", {
      p_customer_name: data.customerName,
      p_customer_phone: data.customerPhone,
      p_customer_email: data.customerEmail ?? null,
      p_subtotal_cents: data.subtotalCents,
      p_total_cents: data.totalCents,
      p_discount_cents: data.discountCents,
      p_pickup_time: data.pickupTime,
      p_order_notes: data.orderNotes ?? null,
      p_payment_status: data.paymentStatus,
      p_redeem_free_drink: data.redeemFreeDrink,
      p_items: data.items,
    });

    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | { order_id: string; order_number: number }
      | undefined;
    if (!row?.order_id) throw new Error("Order could not be created");
    return { orderId: row.order_id, orderNumber: row.order_number };
  });
