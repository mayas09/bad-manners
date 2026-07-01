import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateSchema = z.object({
  orderId: z.string().uuid(),
  originUrl: z.string().url(),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, order_number, total_cents, customer_id, payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr || !order) throw new Error("Order not found");
    if (order.customer_id !== userId) throw new Error("Forbidden");
    if (order.payment_status === "paid") throw new Error("Order already paid");

    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select("name, quantity, unit_price_cents")
      .eq("order_id", data.orderId);
    if (iErr || !items?.length) throw new Error("Order has no items");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: items.map((it) => ({
        price_data: {
          currency: "usd",
          product_data: { name: it.name },
          unit_amount: it.unit_price_cents,
        },
        quantity: it.quantity,
      })),
      success_url: `${data.originUrl}/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.originUrl}/checkout?cancelled=1`,
      metadata: { order_id: order.id, order_number: String(order.order_number) },
    });

    await supabase.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return { url: session.url };
  });

const FinalizeSchema = z.object({ orderId: z.string().uuid(), sessionId: z.string() });

export const finalizeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FinalizeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order } = await supabase
      .from("orders")
      .select("id, customer_id, payment_status, stripe_session_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || order.customer_id !== userId) throw new Error("Order not found");
    if (order.payment_status === "paid") return { paid: true };

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" as any });
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.payment_status === "paid") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "paid",
          status: "confirmed",
          stripe_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .eq("id", data.orderId);
      return { paid: true };
    }
    return { paid: false };
  });
