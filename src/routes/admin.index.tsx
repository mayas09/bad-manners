import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coffee, Clock, Inbox } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

function Overview() {
  const [stats, setStats] = useState<{
    menuCount: number;
    lastUpdated: string | null;
    inquiryCount: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const [menu, inquiries] = await Promise.all([
        supabase
          .from("menu_items")
          .select("updated_at", { count: "exact" })
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase.from("catering_inquiries").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        menuCount: menu.count ?? 0,
        lastUpdated: menu.data?.[0]?.updated_at ?? null,
        inquiryCount: inquiries.count ?? 0,
      });
    })();
  }, []);

  const cards = [
    {
      label: "Menu items",
      value: stats?.menuCount ?? "…",
      icon: Coffee,
      hint: "Across all sections",
    },
    {
      label: "Menu last updated",
      value: stats?.lastUpdated
        ? new Date(stats.lastUpdated).toLocaleString()
        : stats
          ? "Never"
          : "…",
      icon: Clock,
      hint: "Most recent menu change",
    },
    {
      label: "Contact form submissions",
      value: stats?.inquiryCount ?? "…",
      icon: Inbox,
      hint: "Catering / event inquiries",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">A quick look at the state of the site.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
                <Icon className="size-4 text-slate-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-900 break-words">
                {String(c.value)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{c.hint}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
