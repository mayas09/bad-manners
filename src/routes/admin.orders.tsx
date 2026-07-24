import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cancelOrderWithRefund } from "@/lib/checkout.functions";
import { sendPushNotification } from "@/lib/push-send.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShoppingBag, Volume2, VolumeX } from "lucide-react";
import { formatCents } from "@/lib/price-utils";
import { formatInSiteTime } from "@/lib/time-utils";

export const Route = createFileRoute("/admin/orders")({
  component: OrdersPage,
});

type Order = {
  id: string;
  order_number: number;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: "pending" | "confirmed" | "ready" | "picked_up" | "cancelled";
  payment_status: string;
  total_cents: number;
  pickup_time: string;
  created_at: string;
  order_notes: string | null;
};

type Item = { name: string; quantity: number; special_notes: string | null };

const STATUS_FLOW: Record<Order["status"], Order["status"] | null> = {
  pending: "confirmed",
  confirmed: "ready",
  ready: "picked_up",
  picked_up: null,
  cancelled: null,
};

// Notification copy for the customer, keyed by the status the order is moving FROM.
const STATUS_NOTIFICATION: Partial<Record<Order["status"], string>> = {
  pending: "Your order is confirmed! ☕",
  confirmed: "Your order is ready for pickup! 🖤",
  ready: "Thank you for your bad manners! 🖤",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-300",
  picked_up: "bg-slate-100 text-slate-500 border-slate-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  pay_on_pickup: { label: "Pay on Pickup", className: "bg-amber-100 text-amber-800 border-amber-300" },
  unpaid: { label: "Unpaid", className: "bg-red-100 text-red-700 border-red-300" },
  refunded: { label: "Refunded", className: "bg-purple-100 text-purple-700 border-purple-300" },
};

function paymentBadge(status: string) {
  return (
    PAYMENT_BADGE[status] ?? {
      label: status,
      className: "bg-red-100 text-red-700 border-red-300",
    }
  );
}

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, Item[]>>({});
  const [soundOn, setSoundOn] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancelOrder = useServerFn(cancelOrderWithRefund);
  const soundOnRef = useRef(true);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  function playChime() {
    if (!soundOnRef.current) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.type = "sine";
      g.gain.value = 0.1;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.42);
    } catch {
      /* Web Audio unsupported in this browser */
    }
  }

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    const list = (data as Order[]) ?? [];
    // Detect new orders since last load
    if (knownIdsRef.current.size > 0) {
      for (const o of list) {
        if (!knownIdsRef.current.has(o.id) && o.status === "pending") {
          playChime();
          toast.success(`New order #${o.order_number} from ${o.customer_name}`);
          break;
        }
      }
    }
    knownIdsRef.current = new Set(list.map((o) => o.id));
    setOrders(list);

    if (list.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id,name,quantity,special_notes")
        .in(
          "order_id",
          list.map((o) => o.id),
        );
      const grouped: Record<string, Item[]> = {};
      (items ?? []).forEach((it: any) => {
        (grouped[it.order_id] ||= []).push({
          name: it.name,
          quantity: it.quantity,
          special_notes: it.special_notes,
        });
      });
      setItemsByOrder(grouped);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    const interval = window.setInterval(load, 30000);
    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function advance(o: Order) {
    const next = STATUS_FLOW[o.status];
    if (!next) return;
    setAdvancingId(o.id);
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    setAdvancingId(null);
    if (error) return toast.error(error.message);
    toast.success(`Order #${o.order_number} → ${next.replace("_", " ")}`);
    
    const message = STATUS_NOTIFICATION[o.status];
    if (message) {
      const { error: notifyError } = await supabase
        .from("notifications")
        .insert({ customer_id: o.customer_id, order_id: o.id, message });
      if (notifyError) console.error("Failed to send order notification:", notifyError.message);
      try {
        await sendPushNotification({
          data: {
            userId: o.customer_id,
            title: `Order #${o.order_number}`,
            body: message,
            url: `/account/receipt/${o.id}`,
            tag: `order-${o.id}`,
          },
        });
      } catch (err) {
        console.error("Failed to send push notification:", err);
      }
    }
  }

  async function cancel(o: Order) {
    const reason = window.prompt(`Cancellation reason for order #${o.order_number}`);
    if (!reason) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) return toast.error("Cancellation reason is required");

    setCancellingId(o.id);
    try {
      const result = await cancelOrder({ data: { orderId: o.id, reason: trimmed } });
      toast.success(
        result?.refunded
          ? `Order #${o.order_number} cancelled and refunded`
          : `Order #${o.order_number} cancelled`,
      );
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500">Live updates every 30s + realtime push.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSoundOn((s) => !s)}>
          {soundOn ? (
            <>
              <Volume2 className="size-4 mr-1.5" /> Sound on
            </>
          ) : (
            <>
              <VolumeX className="size-4 mr-1.5" /> Muted
            </>
          )}
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <ShoppingBag className="size-10 text-slate-300 mx-auto" />
          <p className="mt-4 text-sm font-medium text-slate-700">No orders yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Customer orders will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const next = STATUS_FLOW[o.status];
            return (
              <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">Order #{o.order_number}</p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CLASS[o.status]}`}
                      >
                        {o.status.replace("_", " ")}
                      </span>
                      {(() => {
                        const badge = paymentBadge(o.payment_status);
                        return (
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      {o.customer_name} ·{" "}
                      <a href={`tel:${o.customer_phone}`} className="text-blue-600 hover:underline">
                        {o.customer_phone}
                      </a>
                    </p>
                    <p className="text-xs text-slate-500">
                      Placed{" "}
                      {formatInSiteTime(o.created_at, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · Pickup{" "}
                      {formatInSiteTime(o.pickup_time, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{formatCents(o.total_cents)}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      <Link
                        to="/account/receipt/$orderId"
                        params={{ orderId: o.id }}
                        className="inline-flex items-center rounded-full border border-[--pink-deep] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[--pink-deep] transition-colors hover:bg-[--pink-deep] hover:text-white"
                      >
                        Receipt
                      </Link>
                      {next && (
                        <Button
                          size="sm"
                          disabled={advancingId === o.id}
                          onClick={() => advance(o)}
                        >
                          {advancingId === o.id ? "…" : `Mark ${next.replace("_", " ")}`}
                        </Button>
                      )}
                      {o.status !== "cancelled" && o.status !== "picked_up" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancellingId === o.id}
                          onClick={() => cancel(o)}
                        >
                          {cancellingId === o.id ? "…" : "Cancel"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 border-t border-slate-100 pt-3 space-y-1 text-sm text-slate-700">
                  {(itemsByOrder[o.id] ?? []).map((it, i) => (
                    <li key={i}>
                      <span className="font-medium">{it.quantity}×</span> {it.name}
                      {it.special_notes && (
                        <span className="text-slate-500 italic"> — {it.special_notes}</span>
                      )}
                    </li>
                  ))}
                  {o.order_notes && (
                    <li className="text-xs text-slate-500 italic">Notes: {o.order_notes}</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
