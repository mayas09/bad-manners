import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { finalizeOrder } from "@/lib/checkout.functions";
import { formatCents } from "@/lib/price-utils";
import { CheckCircle2, Clock } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({ session_id: z.string().optional() });

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

function OrderPage() {
  const { orderId } = Route.useParams();
  const { session_id } = useSearch({ from: "/order/$orderId" });
  const finalize = useServerFn(finalizeOrder);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (session_id) {
        try { await finalize({ data: { orderId, sessionId: session_id } }); } catch {}
      }
      const { data: o } = await supabase.from("orders").select("id,order_number,status,payment_status,total_cents,pickup_time,customer_name").eq("id", orderId).maybeSingle();
      const { data: items } = await supabase.from("order_items").select("name,quantity,unit_price_cents").eq("order_id", orderId);
      if (o) setOrder({ ...(o as any), items: items ?? [] });
      setLoading(false);
    })();
  }, [orderId, session_id, finalize]);

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!order) return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="text-center">
        <h1 className="font-display text-3xl">Order not found</h1>
        <Link to="/" className="text-fire underline mt-4 inline-block">Back to site</Link>
      </div>
    </div>
  );

  const paid = order.payment_status === "paid";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[--pink]/20 py-4 px-4">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <Link to="/" className="font-display text-xl">Bad <span className="text-fire">Manners</span></Link>
          <Link to="/account" className="text-sm text-muted-foreground hover:underline">My orders</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="text-center">
          {paid ? <CheckCircle2 className="mx-auto size-14 text-emerald-500" /> : <Clock className="mx-auto size-14 text-amber-500" />}
          <h1 className="mt-4 font-display text-4xl">{paid ? "Order confirmed!" : "Payment pending"}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Order <span className="font-display text-fire">#{order.order_number}</span> · {order.customer_name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pickup at {new Date(order.pickup_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — 697 Haywood Rd, Asheville
          </p>
        </div>

        <div className="mt-8 glass rounded-2xl p-6">
          <h2 className="font-display text-xl">What you're getting</h2>
          <div className="mt-3 space-y-2">
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{it.quantity}× {it.name}</span>
                <span className="text-fire font-semibold">{formatCents(it.quantity * it.unit_price_cents)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[--pink]/20 flex justify-between font-display text-xl">
            <span>Total</span><span className="text-fire">{formatCents(order.total_cents)}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
