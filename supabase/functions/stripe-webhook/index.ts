import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import Stripe from "https://esm.sh/stripe@22.3.0";

const METADATA_CHUNK_PREFIX = "order_data_";

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
  return JSON.parse(json);
}

function toMenuItemId(id: string) {
  const rawId = id.startsWith("menu:") ? id.slice(5) : id;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(rawId) ? rawId : null;
}

function stripePaymentIntentId(pi: string | { id?: string } | null) {
  if (typeof pi === "string") return pi;
  return pi?.id ?? null;
}

Deno.serve(async (request) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
    console.error("stripe-webhook: missing required environment variables");
    return new Response("Server not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = new Stripe(stripeSecretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (err) {
    console.error("stripe-webhook: signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("ok", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return new Response("ok", { status: 200 });
  }

  const orderId = session.metadata?.order_id;
  const customerId = session.metadata?.customer_id;
  if (!orderId || !customerId) {
    console.error("stripe-webhook: missing order_id or customer_id in session metadata");
    return new Response("Bad metadata", { status: 400 });
  }

  let orderData: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string | null;
    subtotalCents: number;
    totalCents: number;
    discountCents: number;
    pickupTime: string;
    orderNotes?: string | null;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unit_price_cents: number;
      special_notes?: string | null;
    }>;
  };

  try {
    orderData = unpackOrderMetadata(session.metadata);
  } catch (err) {
    console.error("stripe-webhook: failed to unpack metadata", err);
    return new Response("Bad metadata", { status: 400 });
  }

  if ((session.amount_total ?? 0) !== orderData.totalCents) {
    console.error("stripe-webhook: amount mismatch", {
      orderId,
      paid: session.amount_total,
      expected: orderData.totalCents,
    });
    return new Response("Amount mismatch", { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const itemsPayload = orderData.items.map((it) => ({
    menu_item_id: toMenuItemId(it.id),
    name: it.name,
    quantity: it.quantity,
    unit_price_cents: it.unit_price_cents,
    special_notes: it.special_notes || null,
  }));

  const { error: rpcErr } = await supabaseAdmin.rpc("record_paid_order", {
    p_order_id: orderId,
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
});
