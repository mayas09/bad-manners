import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/price-utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";


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
  dailyRevenue: { day: string; revenue: number }[];
  avgOrderValue: number;
};


function startOf(kind: "day" | "week" | "month") {
  if (kind === "week") {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek.toISOString();
  }
  if (kind === "month") {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return startOfMonth.toISOString();
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay.toISOString();
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

        const [ordersMonth, revenueEvents, custWeek, custMonth, itemRows] = await Promise.all([
          supabase.from("orders").select("id, created_at").gte("created_at", monthISO),
          supabase
            .from("analytics_events")
            .select("created_at, value_cents")
            .eq("event_type", "sale_completed")
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
        if (revenueEvents.error) throw revenueEvents.error;

        const orders = ordersMonth.data ?? [];
        const sumRevenue = (since: string) =>
          (revenueEvents.data ?? [])
            .filter((e) => e.created_at >= since)
            .reduce((s, e) => s + (e.value_cents ?? 0), 0);
        const countOrders = (since: string) => orders.filter((o) => o.created_at >= since).length;

        const counts: Record<string, number> = {};
        for (const r of (itemRows.data as any[]) ?? []) {
          counts[r.name] = (counts[r.name] ?? 0) + (r.quantity ?? 1);
        }
        const topItems = Object.entries(counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Last 7 days daily revenue
        const days: { day: string; revenue: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - i);
          const next = new Date(d);
          next.setDate(next.getDate() + 1);
          const rev = (revenueEvents.data ?? [])
            .filter((e) => e.created_at >= d.toISOString() && e.created_at < next.toISOString())
            .reduce((s, e) => s + (e.value_cents ?? 0), 0);
          days.push({
            day: d.toLocaleDateString(undefined, { weekday: "short" }),
            revenue: rev,
          });
        }

        const revMonth = sumRevenue(monthISO);
        const ordMonth = countOrders(monthISO);
        const avgOrderValue = ordMonth > 0 ? Math.round(revMonth / ordMonth) : 0;

        setData({
          revenueToday: sumRevenue(dayISO),
          revenueWeek: sumRevenue(weekISO),
          revenueMonth: revMonth,
          ordersToday: countOrders(dayISO),
          ordersWeek: countOrders(weekISO),
          ordersMonth: ordMonth,
          newCustomersWeek: custWeek.count ?? 0,
          newCustomersMonth: custMonth.count ?? 0,
          topItems,
          dailyRevenue: days,
          avgOrderValue,
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
        <Stat label="Avg order value (month)" value={formatCents(data.avgOrderValue)} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">Daily revenue (last 7 days)</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dailyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(v) => formatCents(Number(v))}
              />
              <Tooltip formatter={(v: number) => formatCents(v)} />
              <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
