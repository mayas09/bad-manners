import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { finalizeOrder } from "@/lib/checkout.functions";
import { formatCents } from "@/lib/price-utils";
import { formatInSiteTime } from "@/lib/time-utils";
import { useCart } from "@/lib/cart-context";
import { CheckCircle2, Clock } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({ session_id: z.string().optional() });
const STRIPE_DRAFT_KEY = "bm_stripe_checkout_draft_v1";

export const Route = createFileRoute("/order/$orderId")({
  validateSearch: searchSchema,
  component: OrderPage,
});

type OrderData = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  total_cents: number;
  pickup_time: string;
  customer_name: string;
  items: { name: string; quantity: number; unit_price_cents: number }[];
};

type OrderRow = Omit<OrderData, "items">;

function OrderPage() {
  const { orderId } = Route.useParams();
  const { session_id } = useSearch({ from: "/order/$orderId" });
  const finalize = useServerFn(finalizeOrder);
  const cart = useCart();
  // Kept in a ref (not a effect dependency) because cart.clear() below
  // creates a new cart object on every payment-finalizing run. Depending on
  // `cart` directly would re-trigger this effect mid-flight, cancelling the
  // in-progress run before it ever reaches the final setLoading(false) and
  // leaving the UI stuck on "Recording your payment..." forever.
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentFinalizing, setPaymentFinalizing] = useState(!!session_id);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      const { data: o } = await supabase
        .from("orders")
        .select("id,order_number,status,payment_status,total_cents,pickup_time,customer_name")
        .eq("id", orderId)
        .maybeSingle();
      const { data: items } = await supabase
        .from("order_items")
        .select("name,quantity,unit_price_cents")
        .eq("order_id", orderId);
      if (!cancelled && o) setOrder({ ...(o as OrderRow), items: items ?? [] });
      return !!o;
    }

    (async () => {
      setLoading(true);
      setPaymentError(null);
      setPaymentFinalizing(!!session_id);

      if (session_id) {
        try {
          const result = await finalize({ data: { orderId, sessionId: session_id } });
          if (result?.paid) {
            cartRef.current.clear();
            sessionStorage.removeItem(STRIPE_DRAFT_KEY);
          }
        } catch (e) {
          console.error("Order payment verification failed", e);
          if (!cancelled) {
            setPaymentError(e instanceof Error ? e.message : "Payment verification failed");
          }
        }
      }
      await loadOrder();
      if (!cancelled) {
        setPaymentFinalizing(false);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, session_id, finalize]);

  if (loading || paymentFinalizing) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center">
          <Clock className="mx-auto size-12 text-amber-500" />
          <h1 className="mt-4 font-display text-3xl">
            {session_id ? "Recording your payment…" : "Loading…"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session_id
              ? "Keep this page open while we confirm your order."
              : "Getting your order details."}
          </p>
        </div>
      </div>
    );
  }
  if (!order)
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center">
          <h1 className="font-display text-3xl">
            {paymentError ? "Payment needs attention" : "Order not found"}
          </h1>
          {paymentError && (
            <>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {paymentError}. If your card was charged, contact the shop and include this order
                ID.
              </p>
              <p className="mt-2 font-mono text-sm select-all">{orderId}</p>
            </>
          )}
          <Link to="/" className="text-fire underline mt-4 inline-block">
            Back to site
          </Link>
        </div>
      </div>
    );

  const paid = order.payment_status === "paid";
  const payOnPickup = order.payment_status === "pay_on_pickup";
  const confirmed = paid || payOnPickup;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[--pink]/20 py-4 px-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <Link to="/" className="font-display text-xl">
            Bad <span className="text-fire">Manners</span>
          </Link>
          <Link to="/account" className="text-sm text-muted-foreground hover:underline">
            My orders
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="text-center">
          {confirmed ? (
            <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          ) : (
            <Clock className="mx-auto size-14 text-amber-500" />
          )}
          <h1 className="mt-4 font-display text-4xl">
            {paid
              ? "Order confirmed!"
              : payOnPickup
                ? "Order confirmed — pay at pickup!"
                : "Payment pending"}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Order <span className="font-display text-fire">#{order.order_number}</span> ·{" "}
            {order.customer_name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pickup at{" "}
            {formatInSiteTime(order.pickup_time, {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            — 697 Haywood Rd, Asheville
          </p>
        </div>

        <div className="mt-8 glass rounded-2xl p-6">
          <h2 className="font-display text-xl">What you're getting</h2>
          <div className="mt-3 space-y-2">
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>
                  {it.quantity}× {it.name}
                </span>
                <span className="text-fire font-semibold">
                  {formatCents(it.quantity * it.unit_price_cents)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[--pink]/20 flex justify-between font-display text-xl">
            <span>Total</span>
            <span className="text-fire">{formatCents(order.total_cents)}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
