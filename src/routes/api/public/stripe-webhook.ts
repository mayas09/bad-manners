import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Public webhook endpoint for Stripe. Signature-verified; auth bypass on /api/public/*.
// Handles `checkout.session.completed` idempotently so paid orders are recorded
// even if the customer never returns to the success page.

const PackedOrderSchema = z.object({
  orderId: z.string().uuid(),
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

const METADATA_CHUNK_PREFIX = "order_data_";
const uuidSchema = z.string().uuid();

function unpackOrderMetadata(metadata: Record<string, string> | null | undefined) {
  if (!metadata) throw new Error("Missing metadata");
  const chunkCount = Number(metadata.order_data_chunks);
  if (!Number.isInteger(chunkCount) || chunkCount < 1) throw new Error("Bad chunk count");
  let json = "";
  for (let i = 0; i < chunkCount; i += 1) {
    const c = metadata[`${METADATA_CHUNK_PREFIX}${i}`];
    if (c === undefined) throw new Error(`Missing chunk ${i}`);
    json += c;
  }
  return PackedOrderSchema.parse(JSON.parse(json));
}

function toMenuItemId(id: string) {
  const rawId = id.startsWith("menu:") ? id.slice(5) : id;
  return uuidSchema.safeParse(rawId).success ? rawId : null;
}

function stripePaymentIntentId(pi: string | { id?: string } | null) {
  if (typeof pi === "string") return pi;
  return pi?.id ?? null;
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const apiKey = process.env.STRIPE_SECRET_KEY;
        if (!secret || !apiKey) {
          console.error("stripe-webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
          return new Response("Server not configured", { status: 500 });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing signature", { status: 400 });

        const rawBody = await request.text();

        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(apiKey);

        let event: import("stripe").Stripe.Event;
        try {
          // constructEventAsync is edge/worker-compatible (uses Web Crypto).
          event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
        } catch (err) {
          console.error("stripe-webhook: signature verification failed", err);
          return new Response("Invalid signature", { status: 400 });
        }

        if (event.type !== "checkout.session.completed") {
          return new Response("ok", { status: 200 });
        }

        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        if (session.payment_status !== "paid") {
          return new Response("ok", { status: 200 });
        }

        const customerId = session.metadata?.customer_id;
        if (!customerId) {
          console.error("stripe-webhook: missing customer_id in session metadata");
          return new Response("ok", { status: 200 });
        }

        let orderData: z.infer<typeof PackedOrderSchema>;
        try {
          orderData = unpackOrderMetadata(session.metadata);
        } catch (err) {
          console.error("stripe-webhook: failed to unpack metadata", err);
          return new Response("Bad metadata", { status: 400 });
        }

        if ((session.amount_total ?? 0) !== orderData.totalCents) {
          console.error("stripe-webhook: amount mismatch", {
            orderId: orderData.orderId,
            paid: session.amount_total,
            expected: orderData.totalCents,
          });
          return new Response("Amount mismatch", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: if this session already produced an order, we're done.
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();
        if (existingErr) {
          console.error("stripe-webhook: existing lookup failed", existingErr);
          return new Response("DB error", { status: 500 });
        }
        if (existing) return new Response("ok", { status: 200 });

        const { data: order, error: insertErr } = await supabaseAdmin
          .from("orders")
          .insert({
            id: orderData.orderId,
            customer_id: customerId,
            customer_name: orderData.customerName,
            customer_phone: orderData.customerPhone,
            customer_email: orderData.customerEmail ?? null,
            subtotal_cents: orderData.subtotalCents,
            total_cents: orderData.totalCents,
            discount_cents: orderData.discountCents,
            pickup_time: orderData.pickupTime,
            order_notes: orderData.orderNotes || null,
            payment_status: "paid",
            status: "confirmed",
            stripe_session_id: session.id,
            stripe_payment_intent: stripePaymentIntentId(session.payment_intent),
          })
          .select("id")
          .single();

        if (insertErr?.code === "23505") {
          // Concurrent insert (client finalizeOrder won the race). That's fine.
          return new Response("ok", { status: 200 });
        }
        if (insertErr || !order) {
          console.error("stripe-webhook: order insert failed", insertErr);
          return new Response("DB error", { status: 500 });
        }

        const items = orderData.items.map((it) => ({
          order_id: order.id,
          menu_item_id: toMenuItemId(it.id),
          name: it.name,
          quantity: it.quantity,
          unit_price_cents: it.unit_price_cents,
          special_notes: it.special_notes || null,
        }));

        const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(items);
        if (itemsErr) {
          console.error("stripe-webhook: order_items insert failed", itemsErr);
          return new Response("DB error", { status: 500 });
        }

        if (orderData.discountCents > 0) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("free_drinks_available")
            .eq("id", customerId)
            .single();
          const next = Math.max(0, (profile?.free_drinks_available ?? 0) - 1);
          const { error: redeemErr } = await supabaseAdmin
            .from("profiles")
            .update({ free_drinks_available: next })
            .eq("id", customerId);
          if (redeemErr) console.error("stripe-webhook: reward redeem failed", redeemErr);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
