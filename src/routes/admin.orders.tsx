import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShoppingBag, Volume2, VolumeX } from "lucide-react";
import { formatCents } from "@/lib/price-utils";

export const Route = createFileRoute("/admin/orders")({
  component: OrdersPage,
});

type Order = {
  id: string;
  order_number: number;
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

const STATUS_CLASS: Record<Order["status"], string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-300",
  picked_up: "bg-slate-100 text-slate-500 border-slate-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, Item[]>>({});
  const [soundOn, setSoundOn] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
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
                      {o.payment_status !== "paid" && (
                        <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                          {o.payment_status}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      {o.customer_name} ·{" "}
                      <a href={`tel:${o.customer_phone}`} className="text-blue-600 hover:underline">
                        {o.customer_phone}
                      </a>
                    </p>
                    <p className="text-xs text-slate-500">
                      Placed{" "}
                      {new Date(o.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · Pickup{" "}
                      {new Date(o.pickup_time).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{formatCents(o.total_cents)}</p>
                    {next && (
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={advancingId === o.id}
                        onClick={() => advance(o)}
                      >
                        {advancingId === o.id ? "…" : `Mark ${next.replace("_", " ")}`}
                      </Button>
                    )}
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
