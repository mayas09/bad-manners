import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/price-utils";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});

type Summary = {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  ordersToday: number;
  ordersWeek: number;
  ordersMonth: number;
  newCustomersWeek: number;
  newCustomersMonth: number;
  topItems: { name: string; count: number }[];
};

function startOf(kind: "day" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "week") d.setDate(d.getDate() - 7);
  if (kind === "month") d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function AnalyticsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const dayISO = startOf("day");
        const weekISO = startOf("week");
        const monthISO = startOf("month");

        const [ordersMonth, custWeek, custMonth, itemRows] = await Promise.all([
          supabase
            .from("orders")
            .select("id, total_cents, status, payment_status, created_at")
            .gte("created_at", monthISO),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("created_at", weekISO),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("created_at", monthISO),
          supabase
            .from("order_items")
            .select("name, quantity, orders!inner(created_at)")
            .gte("orders.created_at", monthISO),
        ]);

        if (ordersMonth.error) throw ordersMonth.error;

        const orders = ordersMonth.data ?? [];
        const sumRevenue = (since: string) =>
          orders
            .filter(
              (o) =>
                o.created_at >= since &&
                o.payment_status === "paid" &&
                o.status === "picked_up",
            )
            .reduce((s, o) => s + (o.total_cents ?? 0), 0);
        const countOrders = (since: string) =>
          orders.filter((o) => o.created_at >= since).length;

        const counts: Record<string, number> = {};
        for (const r of (itemRows.data as any[]) ?? []) {
          counts[r.name] = (counts[r.name] ?? 0) + (r.quantity ?? 1);
        }
        const topItems = Object.entries(counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setData({
          revenueToday: sumRevenue(dayISO),
          revenueWeek: sumRevenue(weekISO),
          revenueMonth: sumRevenue(monthISO),
          ordersToday: countOrders(dayISO),
          ordersWeek: countOrders(weekISO),
          ordersMonth: countOrders(monthISO),
          newCustomersWeek: custWeek.count ?? 0,
          newCustomersMonth: custMonth.count ?? 0,
          topItems,
        });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading analytics…</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">
          Revenue only counts paid orders that were picked up.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Revenue today" value={formatCents(data.revenueToday)} />
        <Stat label="Revenue this week" value={formatCents(data.revenueWeek)} />
        <Stat label="Revenue this month" value={formatCents(data.revenueMonth)} />
        <Stat label="Orders today" value={data.ordersToday.toString()} />
        <Stat label="Orders this week" value={data.ordersWeek.toString()} />
        <Stat label="Orders this month" value={data.ordersMonth.toString()} />
        <Stat label="New customers (7d)" value={data.newCustomersWeek.toString()} />
        <Stat label="New customers (30d)" value={data.newCustomersMonth.toString()} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">Top 5 items (30 days)</h2>
        {data.topItems.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No orders in the last 30 days yet.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {data.topItems.map((t, i) => (
              <li
                key={t.name}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
              >
                <span className="text-sm text-slate-700">
                  <span className="mr-2 font-mono text-slate-400">{i + 1}.</span>
                  {t.name}
                </span>
                <span className="text-sm font-semibold text-pink-600">{t.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
