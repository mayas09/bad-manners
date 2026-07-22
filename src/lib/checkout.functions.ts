import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireEnv } from "@/lib/require-env";
import { z } from "zod";


const CreateSchema = z.object({
  orderId: z.string().uuid(),
  originUrl: z.string().url(),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(1).max(20),
  customerEmail: z.string().email().nullable().optional(),
  subtotalCents: z.number().int().min(0),
  totalCents: z.number().int().min(0),
  discountCents: z.number().int().min(0),
  pickupTime: z.string().min(1),
  orderNotes: z.string().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200),
        quantity: z.number().int().min(1).max(99),
        unit_price_cents: z.number().int().min(0),
        special_notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1),
});

// Stripe hard-caps metadata at 50 keys and 500 chars/value. `order_id`,
// `order_data_chunks`, and `customer_id` (added by the caller) each take a
// slot, so only 47 remain for the chunked order payload below.
const METADATA_CHUNK_SIZE = 450;
const METADATA_CHUNK_PREFIX = "order_data_";
const METADATA_RESERVED_KEYS = 3;
const METADATA_MAX_KEYS = 50;
const METADATA_MAX_CHUNKS = METADATA_MAX_KEYS - METADATA_RESERVED_KEYS;
const uuidSchema = z.string().uuid();

// originUrl is only needed to build the success/cancel URLs at session
// creation time and is never read back, so it's excluded from the payload
// to leave more headroom under Stripe's metadata limits.
const PackedOrderSchema = CreateSchema.omit({ originUrl: true });
type PackedOrderData = z.infer<typeof PackedOrderSchema>;

function packOrderMetadata(orderData: z.infer<typeof CreateSchema>) {
  const { originUrl: _originUrl, ...packed } = orderData;
  const json = JSON.stringify(packed);
  const metadata: Record<string, string> = {
    order_id: orderData.orderId,
  };
  const chunkCount = Math.ceil(json.length / METADATA_CHUNK_SIZE);
  if (chunkCount > METADATA_MAX_CHUNKS) {
    throw new Error(
      "This order is too large to process online (too many items/notes). " +
        "Please remove some items or split it into two orders.",
    );
  }
  for (let i = 0; i < chunkCount; i += 1) {
    metadata[`${METADATA_CHUNK_PREFIX}${i}`] = json.slice(
      i * METADATA_CHUNK_SIZE,
      (i + 1) * METADATA_CHUNK_SIZE,
    );
  }
  metadata.order_data_chunks = String(chunkCount);
  return metadata;
}

function unpackOrderMetadata(metadata: Record<string, string> | null | undefined): PackedOrderData {
  if (!metadata) throw new Error("Missing Stripe order metadata");
  const chunkCount = Number(metadata.order_data_chunks);
  if (!Number.isInteger(chunkCount) || chunkCount < 1) {
    console.error("Incomplete Stripe order metadata for session", {
      orderId: metadata.order_id ?? "(none)",
      metadataKeys: Object.keys(metadata),
      orderDataChunksValue: metadata.order_data_chunks ?? "(missing)",
    });
    throw new Error("Incomplete Stripe order metadata");
  }
  const chunkKeys = Array.from({ length: chunkCount }, (_, i) => `${METADATA_CHUNK_PREFIX}${i}`);
  const missingKeys = chunkKeys.filter((k) => metadata[k] === undefined);
  if (missingKeys.length > 0) {
    console.error("Stripe order metadata is missing expected chunk keys", {
      orderId: metadata.order_id ?? "(none)",
      metadataKeys: Object.keys(metadata),
      missingKeys,
    });
    throw new Error("Incomplete Stripe order metadata");
  }
  const json = chunkKeys.map((k) => metadata[k]).join("");
  return PackedOrderSchema.parse(JSON.parse(json));
}

function stripePaymentIntentId(paymentIntent: string | { id?: string } | null) {
  if (typeof paymentIntent === "string") return paymentIntent;
  return paymentIntent?.id ?? null;
}

function toMenuItemId(id: string) {
  const rawId = id.startsWith("menu:") ? id.slice(5) : id;
  return uuidSchema.safeParse(rawId).success ? rawId : null;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Server-side price validation: trust ONLY prices from menu_items.
    // Client-supplied unit_price_cents, subtotal, discount, and total are ignored.
    const menuIds: string[] = [];
    for (const it of data.items) {
      const menuId = toMenuItemId(it.id);
      if (!menuId) throw new Error(`Cart contains an item that isn't on the menu: ${it.name}`);
      menuIds.push(menuId);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: menuRows, error: menuErr } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, price_cents, is_sold_out")
      .in("id", menuIds);
    if (menuErr) throw new Error(`Failed to load menu prices: ${menuErr.message}`);
    const priceMap = new Map((menuRows ?? []).map((r) => [r.id, r]));

    const verifiedItems = data.items.map((it) => {
      const menuId = toMenuItemId(it.id)!;
      const row = priceMap.get(menuId);
      if (!row) throw new Error(`Menu item no longer available: ${it.name}`);
      if (row.is_sold_out) throw new Error(`Sold out: ${row.name}`);
      if (!row.price_cents || row.price_cents <= 0) {
        throw new Error(`This item can't be ordered online: ${row.name}`);
      }
      return {
        id: it.id,
        name: row.name,
        quantity: it.quantity,
        unit_price_cents: row.price_cents,
        special_notes: it.special_notes ?? null,
      };
    });

    const serverSubtotal = verifiedItems.reduce(
      (s, it) => s + it.quantity * it.unit_price_cents,
      0,
    );

    // Discount: recomputed server-side from the caller's own free-drink balance.
    let serverDiscount = 0;
    if (data.discountCents > 0) {
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
      serverDiscount = Number.isFinite(cheapest) ? cheapest : 0;
    }
    const serverTotal = Math.max(0, serverSubtotal - serverDiscount);

    // Rebuild the payload with server-verified values before packing into metadata.
    const verifiedPayload: z.infer<typeof CreateSchema> = {
      ...data,
      items: verifiedItems,
      subtotalCents: serverSubtotal,
      discountCents: serverDiscount,
      totalCents: serverTotal,
    };

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(requireEnv(["STRIPE_SECRET_KEY"] as const).STRIPE_SECRET_KEY);

    const coupon =
      serverDiscount > 0
        ? await stripe.coupons.create({
            amount_off: serverDiscount,
            currency: "usd",
            duration: "once",
            name: "Free drink reward",
          })
        : null;

    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: verifiedItems.map((it) => ({
            price_data: {
              currency: "usd",
              product_data: { name: it.name },
              unit_amount: it.unit_price_cents,
            },
            quantity: it.quantity,
          })),
          discounts: coupon ? [{ coupon: coupon.id }] : [],
          success_url: `${data.originUrl}/order/${data.orderId}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${data.originUrl}/checkout?cancelled=1`,
          metadata: {
            ...packOrderMetadata(verifiedPayload),
            customer_id: userId,
          },
        },
        // Stable idempotency key — repeated identical requests for the same
        // orderId return the same session instead of creating duplicates.
        { idempotencyKey: `checkout-session-${data.orderId}` },
      );
    } finally {
      // Coupon is single-use and attached to the session; delete after use
      // to keep the Stripe dashboard clean. Failure here must not fail checkout.
      if (coupon) {
        try {
          await stripe.coupons.del(coupon.id);
        } catch (err) {
          console.warn("[stripe] failed to delete coupon", coupon.id, err);
        }
      }
    }

    return { url: session.url };
  });

const FinalizeSchema = z.object({
  orderId: z.string().uuid(),
  sessionId: z.string().min(1),
});
const CancelOrderSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});


export const finalizeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FinalizeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(requireEnv(["STRIPE_SECRET_KEY"] as const).STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.metadata?.order_id !== data.orderId) {
      throw new Error("Session does not match this order");
    }
    if (session.metadata?.customer_id !== userId) {
      throw new Error("Session does not match this customer");
    }
    if (session.payment_status !== "paid") return { paid: false, orderId: data.orderId };

    const orderData = unpackOrderMetadata(session.metadata);
    if (orderData.orderId !== data.orderId) throw new Error("Session order data does not match");
    if ((session.amount_total ?? 0) !== orderData.totalCents) {
      throw new Error("Paid amount does not match order total");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const itemsPayload = orderData.items.map((it) => ({
      menu_item_id: toMenuItemId(it.id),
      name: it.name,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents,
      special_notes: it.special_notes || null,
    }));

    const { data: rpcRows, error: rpcErr } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: { order_id: string; order_number: number; already_existed: boolean }[] | null;
      error: { message: string } | null;
    }>)("record_paid_order", {
      p_order_id: orderData.orderId,
      p_customer_id: userId,
      p_customer_name: orderData.customerName,
      p_customer_phone: orderData.customerPhone,
      p_customer_email: orderData.customerEmail ?? null,
      p_subtotal_cents: orderData.subtotalCents,
      p_total_cents: orderData.totalCents,
      p_discount_cents: orderData.discountCents,
      p_pickup_time: orderData.pickupTime,
      p_order_notes: orderData.orderNotes ?? null,
      p_stripe_session_id: data.sessionId,
      p_stripe_payment_intent: stripePaymentIntentId(session.payment_intent),
      p_items: itemsPayload,
    });
    if (rpcErr) throw new Error(`Failed to record paid order: ${rpcErr.message}`);
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!row) throw new Error("Failed to record paid order: empty result");
    return { paid: true, orderId: row.order_id, orderNumber: row.order_number };
  });


export const cancelOrderWithRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CancelOrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, order_number, status, payment_status, total_cents, stripe_payment_intent",
      )
      .eq("id", data.orderId)
      .single();
    if (orderErr || !order) throw new Error("Order not found");
    if (order.status === "cancelled") return { cancelled: true, refunded: false };
    if (order.status === "picked_up") throw new Error("Picked up orders cannot be cancelled");

    let refundId: string | null = null;
    const update: {
      status: "cancelled";
      payment_status?: "refunded";
      cancellation_reason: string;
      cancelled_by: string;
      stripe_refund_id?: string | null;
      refunded_at?: string;
    } = {
      status: "cancelled",
      cancellation_reason: data.reason,
      cancelled_by: userId,
    };

    if (order.payment_status === "paid") {
      if (!order.stripe_payment_intent) {
        throw new Error("Cannot refund paid order because the Stripe payment is missing");
      }
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(requireEnv(["STRIPE_SECRET_KEY"] as const).STRIPE_SECRET_KEY);
      const refund = await stripe.refunds.create(
        {
          payment_intent: order.stripe_payment_intent,
          reason: "requested_by_customer",
          metadata: {
            order_id: order.id,
            order_number: String(order.order_number),
            cancelled_by: userId,
            cancellation_reason: data.reason,
          },
        },
        { idempotencyKey: `order-cancel-refund-${order.id}` },
      );
      refundId = refund.id;
      update.payment_status = "refunded";
      update.stripe_refund_id = refund.id;
      update.refunded_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update(update)
      .eq("id", order.id);
    if (updateErr) throw new Error(`Failed to cancel order: ${updateErr.message}`);

    const refundCopy = refundId
      ? " A full refund has been issued to your original payment method."
      : "";
    const { error: notifyErr } = await supabaseAdmin.from("notifications").insert({
      customer_id: order.customer_id,
      order_id: order.id,
      message: `Your order #${order.order_number} was cancelled. Reason: ${data.reason}.${refundCopy}`,
    });
    if (notifyErr)
      throw new Error(`Order cancelled, but notification failed: ${notifyErr.message}`);

    return { cancelled: true, refunded: !!refundId };
  });
