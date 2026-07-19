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

        const itemsPayload = orderData.items.map((it) => ({
          menu_item_id: toMenuItemId(it.id),
          name: it.name,
          quantity: it.quantity,
          unit_price_cents: it.unit_price_cents,
          special_notes: it.special_notes || null,
        }));

        const { error: rpcErr } = await (supabaseAdmin.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>)("record_paid_order", {
          p_order_id: orderData.orderId,
          p_customer_id: customerId,
          p_customer_name: orderData.customerName,
          p_customer_phone: orderData.customerPhone,
          p_customer_email: orderData.customerEmail ?? null,
          p_subtotal_cents: orderData.subtotalCents,
          p_total_cents: orderData.totalCents,
          p_discount_cents: orderData.discountCents,
          p_pickup_time: orderData.pickupTime,
          p_order_notes: orderData.orderNotes ?? null,
          p_stripe_session_id: session.id,
          p_stripe_payment_intent: stripePaymentIntentId(session.payment_intent),
          p_items: itemsPayload,
        });

        if (rpcErr) {
          console.error("stripe-webhook: record_paid_order failed", rpcErr);
          return new Response("DB error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

