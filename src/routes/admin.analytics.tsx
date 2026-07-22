import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/price-utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});

// -------- Range presets --------
const RANGES = [
  { key: "1d",   label: "24h",     days: 1,   bucket: "hour" as const },
  { key: "7d",   label: "7 days",  days: 7,   bucket: "day"  as const },
  { key: "15d",  label: "15 days", days: 15,  bucket: "day"  as const },
  { key: "30d",  label: "30 days", days: 30,  bucket: "day"  as const },
  { key: "90d",  label: "3 months",days: 90,  bucket: "week" as const },
  { key: "365d", label: "1 year",  days: 365, bucket: "month" as const },
];

type RangeKey = (typeof RANGES)[number]["key"];

// An order counts as revenue when it was actually paid (card) or picked up (cash).
const PAID_FILTER =
  "payment_status.eq.paid,and(payment_status.eq.pay_on_pickup,status.eq.picked_up)";

type OrderRow = {
  id: string;
  created_at: string;
  total_cents: number;
  customer_id: string | null;
};

type ItemRow = {
  name: string;
  menu_item_id: string | null;
  quantity: number;
  unit_price_cents: number;
  order_id: string;
  orders: { created_at: string; payment_status: string; status: string } | null;
};

type MenuLite = { id: string; name: string };

function startForRange(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketKey(iso: string, bucket: "hour" | "day" | "week" | "month") {
  const d = new Date(iso);
  if (bucket === "hour") {
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }
  if (bucket === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (bucket === "week") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function bucketLabel(key: string, bucket: "hour" | "day" | "week" | "month") {
  const d = new Date(key);
  if (bucket === "hour")
    return d.toLocaleTimeString(undefined, { hour: "numeric" });
  if (bucket === "month")
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function enumerateBuckets(days: number, bucket: "hour" | "day" | "week" | "month") {
  const keys: string[] = [];
  const now = new Date();
  if (bucket === "hour") {
    for (let i = days * 24 - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() - i);
      keys.push(d.toISOString());
    }
    return keys;
  }
  if (bucket === "month") {
    const months = Math.max(1, Math.round(days / 30));
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    }
    return keys;
  }
  if (bucket === "week") {
    const weeks = Math.max(1, Math.round(days / 7));
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7 - d.getDay());
      d.setHours(0, 0, 0, 0);
      keys.push(d.toISOString().slice(0, 10));
    }
    return keys;
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// Distinct chart colors for selected items
const SERIES_COLORS = [
  "#ec4899", "#0ea5e9", "#22c55e", "#f97316", "#8b5cf6",
  "#eab308", "#14b8a6", "#ef4444", "#6366f1", "#84cc16",
];

function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [menu, setMenu] = useState<MenuLite[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [newCustomers, setNewCustomers] = useState(0);

  const rangeCfg = RANGES.find((r) => r.key === range)!;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const start = startForRange(rangeCfg.days).toISOString();

        const [ordersRes, itemsRes, menuRes, custRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, created_at, total_cents, customer_id, payment_status, status")
            .gte("created_at", start)
            .or(PAID_FILTER),
          supabase
            .from("order_items")
            .select(
              "name, menu_item_id, quantity, unit_price_cents, order_id, orders!inner(created_at, payment_status, status)",
            )
            .gte("orders.created_at", start)
            .or(PAID_FILTER, { foreignTable: "orders" }),
          supabase.from("menu_items").select("id, name").order("name"),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("created_at", start),
        ]);

        if (ordersRes.error) throw ordersRes.error;
        if (itemsRes.error) throw itemsRes.error;
        if (menuRes.error) throw menuRes.error;

        setOrders((ordersRes.data ?? []) as unknown as OrderRow[]);
        setItems((itemsRes.data ?? []) as unknown as ItemRow[]);
        setMenu((menuRes.data ?? []) as MenuLite[]);
        setNewCustomers(custRes.count ?? 0);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, [range, rangeCfg.days]);

  // ------ KPIs ------
  const kpis = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
    const count = orders.length;
    const aov = count > 0 ? Math.round(revenue / count) : 0;
    const uniqueCustomers = new Set(orders.map((o) => o.customer_id).filter(Boolean)).size;
    return { revenue, count, aov, uniqueCustomers };
  }, [orders]);

  // ------ Revenue trend ------
  const revenueSeries = useMemo(() => {
    const buckets = enumerateBuckets(rangeCfg.days, rangeCfg.bucket);
    const map = new Map<string, number>(buckets.map((k) => [k, 0]));
    for (const o of orders) {
      const k = bucketKey(o.created_at, rangeCfg.bucket);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + (o.total_cents ?? 0));
    }
    return buckets.map((k) => ({
      key: k,
      label: bucketLabel(k, rangeCfg.bucket),
      revenue: map.get(k) ?? 0,
    }));
  }, [orders, rangeCfg]);

  // ------ Top items table ------
  const topItems = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; revenue: number; id: string | null }>();
    for (const r of items) {
      const key = r.menu_item_id ?? r.name;
      const prev = agg.get(key) ?? { name: r.name, qty: 0, revenue: 0, id: r.menu_item_id };
      prev.qty += r.quantity ?? 0;
      prev.revenue += (r.quantity ?? 0) * (r.unit_price_cents ?? 0);
      agg.set(key, prev);
    }
    return [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [items]);

  // ------ Per-item performance chart ------
  const itemChart = useMemo(() => {
    const buckets = enumerateBuckets(rangeCfg.days, rangeCfg.bucket);
    // Build map: bucket -> { itemId -> qty }
    const perBucket = new Map<string, Record<string, number>>(
      buckets.map((k) => [k, {}]),
    );
    for (const r of items) {
      const id = r.menu_item_id ?? "";
      if (!id || !selectedItems.includes(id)) continue;
      const created = r.orders?.created_at;
      if (!created) continue;
      const bk = bucketKey(created, rangeCfg.bucket);
      const slot = perBucket.get(bk);
      if (!slot) continue;
      slot[id] = (slot[id] ?? 0) + (r.quantity ?? 0);
    }
    return buckets.map((k) => {
      const row: Record<string, number | string> = {
        key: k,
        label: bucketLabel(k, rangeCfg.bucket),
      };
      const slot = perBucket.get(k) ?? {};
      for (const id of selectedItems) row[id] = slot[id] ?? 0;
      return row;
    });
  }, [items, selectedItems, rangeCfg]);

  function toggleItem(id: string) {
    setSelectedItems((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= SERIES_COLORS.length
          ? cur
          : [...cur, id],
    );
  }

  if (loading) return <p className="text-sm text-slate-500">Loading analytics…</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500">
            Revenue includes paid card orders and picked-up cash orders in the selected range.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                range === r.key
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={formatCents(kpis.revenue)} />
        <Stat label="Orders" value={kpis.count.toString()} />
        <Stat label="Avg order value" value={formatCents(kpis.aov)} />
        <Stat label="Unique customers" value={kpis.uniqueCustomers.toString()} />
        <Stat label="New customers (signups)" value={newCustomers.toString()} />
      </div>

      <ChartCard
        title="Revenue over time"
        subtitle={`Grouped by ${rangeCfg.bucket}`}
        empty={kpis.revenue === 0 ? "No paid orders in this range yet." : undefined}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(v) => formatCents(Number(v))}
            />
            <Tooltip
              formatter={(v: number) => formatCents(v)}
              labelFormatter={(l) => `Period: ${l}`}
            />
            <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-slate-900">Item performance</h2>
            <p className="text-xs text-slate-500">
              Pick up to {SERIES_COLORS.length} items to compare units sold per {rangeCfg.bucket}.
            </p>
          </div>
          {selectedItems.length > 0 && (
            <button
              onClick={() => setSelectedItems([])}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Clear selection
            </button>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {menu.map((m) => {
            const idx = selectedItems.indexOf(m.id);
            const active = idx >= 0;
            const color = active ? SERIES_COLORS[idx] : undefined;
            return (
              <button
                key={m.id}
                onClick={() => toggleItem(m.id)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? "text-white border-transparent"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
                style={active ? { backgroundColor: color } : undefined}
              >
                {m.name}
              </button>
            );
          })}
        </div>

        <div className="h-72">
          {selectedItems.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-slate-400">
              Select items above to plot them.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={itemChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number, id: string) => [
                    value,
                    menu.find((m) => m.id === id)?.name ?? id,
                  ]}
                />
                <Legend
                  formatter={(id) => menu.find((m) => m.id === id)?.name ?? id}
                />

                {selectedItems.map((id, i) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={SERIES_COLORS[i]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900">Top items by revenue</h2>
        {topItems.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No sales yet in this range.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2">#</th>
                <th className="py-2">Item</th>
                <th className="py-2 text-right">Units</th>
                <th className="py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((t, i) => (
                <tr key={t.name + i} className="border-t border-slate-100">
                  <td className="py-2 text-slate-400 font-mono">{i + 1}</td>
                  <td className="py-2 text-slate-800">{t.name}</td>
                  <td className="py-2 text-right text-slate-700">{t.qty}</td>
                  <td className="py-2 text-right font-semibold text-pink-600">
                    {formatCents(t.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function ChartCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="mb-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="h-72">
        {empty ? (
          <div className="grid h-full place-items-center text-sm text-slate-400">{empty}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
