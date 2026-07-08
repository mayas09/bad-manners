import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const itemTotal = data.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price_cents,
      0,
    );
    if (itemTotal !== data.subtotalCents) throw new Error("Cart total changed");
    if (Math.max(0, data.subtotalCents - data.discountCents) !== data.totalCents) {
      throw new Error("Order total changed");
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const coupon =
      data.discountCents > 0
        ? await stripe.coupons.create({
            amount_off: data.discountCents,
            currency: "usd",
            duration: "once",
            name: "Free drink reward",
          })
        : null;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: data.items.map((it) => ({
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
      metadata: { order_id: data.orderId, customer_id: userId },
    });

    return { url: session.url };
  });

const FinalizeSchema = CreateSchema.omit({ originUrl: true }).extend({ sessionId: z.string() });
const CancelOrderSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

function toOrderItems(items: z.infer<typeof CreateSchema>["items"], orderId: string) {
  return items.map((it) => ({
    order_id: orderId,
    menu_item_id: it.id.startsWith("menu:") ? it.id.slice(5) : null,
    name: it.name,
    quantity: it.quantity,
    unit_price_cents: it.unit_price_cents,
    special_notes: it.special_notes || null,
  }));
}

export const finalizeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FinalizeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, customer_id, payment_status, stripe_session_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (existingOrder) {
      if (existingOrder.customer_id !== userId) throw new Error("Order not found");
      if (existingOrder.payment_status === "paid") return { paid: true };
      if (existingOrder.stripe_session_id !== data.sessionId)
        throw new Error("Session does not match this order");
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.metadata?.order_id !== data.orderId) {
      throw new Error("Session does not match this order");
    }
    if (session.metadata?.customer_id !== userId)
      throw new Error("Session does not match this customer");
    if ((session.amount_total ?? 0) !== data.totalCents)
      throw new Error("Paid amount does not match order total");
    if (session.payment_status === "paid") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const orderItems = toOrderItems(data.items, data.orderId);
      const { error: rpcErr } = await supabaseAdmin.rpc("finalize_paid_order", {
        p_order_id: data.orderId,
        p_customer_id: userId,
        p_customer_name: data.customerName,
        p_customer_phone: data.customerPhone,
        p_customer_email: data.customerEmail ?? null,
        p_subtotal_cents: data.subtotalCents,
        p_total_cents: data.totalCents,
        p_discount_cents: data.discountCents,
        p_pickup_time: data.pickupTime,
        p_order_notes: data.orderNotes || null,
        p_stripe_session_id: data.sessionId,
        p_stripe_payment_intent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
        p_items: orderItems,
      });
      if (rpcErr) throw new Error(`Failed to record payment: ${rpcErr.message}`);
      return { paid: true };
    }
    return { paid: false };
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
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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

    const { error: updateErr } = await supabaseAdmin.from("orders").update(update).eq("id", order.id);
    if (updateErr) throw new Error(`Failed to cancel order: ${updateErr.message}`);

    const refundCopy = refundId ? " A full refund has been issued to your original payment method." : "";
    const { error: notifyErr } = await supabaseAdmin.from("notifications").insert({
      customer_id: order.customer_id,
      order_id: order.id,
      message: `Your order #${order.order_number} was cancelled. Reason: ${data.reason}.${refundCopy}`,
    });
    if (notifyErr) throw new Error(`Order cancelled, but notification failed: ${notifyErr.message}`);

    return { cancelled: true, refunded: !!refundId };
  });
