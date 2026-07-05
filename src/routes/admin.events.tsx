import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatInSiteTime, formatPlainDateInSiteTime } from "@/lib/time-utils";

export const Route = createFileRoute("/admin/events")({
  component: AdminEventsPage,
});

type Row = {
  id: string;
  customer_id: string;
  event_type: string;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  guest_count: number | null;
  budget_range: string | null;
  notes: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  accepted: "Accepted",
  declined: "Declined",
};
const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
};

function AdminEventsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Record<string, { name: string; email: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("catering_requests")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data as Row[]) ?? [];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.customer_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email")
        .in("id", ids);
      const map: Record<string, { name: string; email: string | null }> = {};
      for (const p of (profs as any[]) ?? []) {
        map[p.id] = {
          name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Customer",
          email: p.email,
        };
      }
      setCustomers(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateRow(id: string, patch: Partial<Row>) {
    setSavingId(id);
    const { error } = await supabase.from("catering_requests").update(patch).eq("id", id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    load();
  }

  if (loading) return <div className="text-slate-500">Loading requests…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Catering & Events</h1>
        <p className="text-sm text-slate-500">
          {rows.length} request{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-slate-500 py-8 text-center">No catering requests yet.</p>
      )}

      <div className="space-y-4">
        {rows.map((r) => {
          const c = customers[r.customer_id];
          return (
            <div
              key={r.id}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{r.event_type}</p>
                  <p className="text-sm text-slate-500">
                    {c?.name ?? "Customer"} · {c?.email ?? "—"}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_BADGES[r.status] ?? "bg-slate-100 text-slate-700"}`}
                >
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                <p>
                  <span className="text-slate-400">Date:</span>{" "}
                  {r.event_date ? formatPlainDateInSiteTime(r.event_date) : "—"}
                  {r.event_time ? ` @ ${r.event_time.slice(0, 5)}` : ""}
                </p>
                <p>
                  <span className="text-slate-400">Guests:</span> {r.guest_count ?? "—"}
                </p>
                <p>
                  <span className="text-slate-400">Location:</span> {r.location ?? "—"}
                </p>
                <p>
                  <span className="text-slate-400">Budget:</span> {r.budget_range ?? "—"}
                </p>
              </div>

              {r.notes && (
                <p className="text-sm italic bg-slate-50 p-3 rounded border border-slate-100">
                  "{r.notes}"
                </p>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Internal admin notes (private)
                </label>
                <Textarea
                  defaultValue={r.admin_notes ?? ""}
                  rows={2}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    if (v !== (r.admin_notes ?? "")) updateRow(r.id, { admin_notes: v });
                  }}
                  className="mt-1"
                  placeholder="Notes for the team…"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                {r.status !== "under_review" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingId === r.id}
                    onClick={() => updateRow(r.id, { status: "under_review" })}
                  >
                    Mark Under Review
                  </Button>
                )}
                {r.status !== "accepted" && (
                  <Button
                    size="sm"
                    disabled={savingId === r.id}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => updateRow(r.id, { status: "accepted" })}
                  >
                    Accept
                  </Button>
                )}
                {r.status !== "declined" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingId === r.id}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => updateRow(r.id, { status: "declined" })}
                  >
                    Decline
                  </Button>
                )}
                <span className="ml-auto text-xs text-slate-400 self-center">
                  Submitted{" "}
                  {formatInSiteTime(r.created_at, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
