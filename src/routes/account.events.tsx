import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import {
  formatInSiteTime,
  formatPlainDateInSiteTime,
  getSiteTodayInputValue,
} from "@/lib/time-utils";

export const Route = createFileRoute("/account/events")({
  component: EventsPage,
});

type CateringRequest = {
  id: string;
  event_type: string;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  guest_count: number | null;
  budget_range: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-gray-100 text-gray-800 border-gray-300" },
  under_review: {
    label: "Under Review",
    classes: "bg-blue-100 text-blue-800 border-blue-300",
  },
  accepted: {
    label: "Accepted",
    classes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  declined: { label: "Declined", classes: "bg-red-100 text-red-800 border-red-300" },
};

function EventsPage() {
  const auth = useCustomerAuth();
  const nav = useNavigate();
  const [requests, setRequests] = useState<CateringRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!auth.loading && !auth.user) nav({ to: "/account/login" });
    if (!auth.loading && auth.role === "admin") nav({ to: "/admin" });
  }, [auth.loading, auth.user, auth.role, nav]);

  async function load() {
    if (!auth.user) return;
    const { data } = await supabase
      .from("catering_requests")
      .select(
        "id,event_type,event_date,event_time,location,guest_count,budget_range,notes,status,created_at",
      )
      .eq("customer_id", auth.user.id)
      .order("created_at", { ascending: false });
    setRequests((data as CateringRequest[]) ?? []);
  }

  useEffect(() => {
    if (auth.user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!auth.user) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      customer_id: auth.user.id,
      event_type: String(fd.get("event_type") || "").trim(),
      event_date: (String(fd.get("event_date") || "").trim() || null) as string | null,
      event_time: (String(fd.get("event_time") || "").trim() || null) as string | null,
      location: String(fd.get("location") || "").trim() || null,
      guest_count: fd.get("guest_count") ? Number(fd.get("guest_count")) : null,
      budget_range: String(fd.get("budget_range") || "").trim() || null,
      notes: String(fd.get("notes") || "").trim() || null,
    };
    if (!payload.event_type) return toast.error("Event type is required.");
    setSubmitting(true);
    const { error } = await supabase.from("catering_requests").insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent! We'll be in touch soon 🖤");
    (e.target as HTMLFormElement).reset();
    load();
  }

  if (auth.loading || !auth.user || auth.role === "admin")
    return <div className="min-h-screen grid place-items-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-[--pink]/20 py-4 px-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link to="/" className="font-display text-xl">
            Bad <span className="text-fire">Manners</span>
          </Link>
          <Link
            to="/account"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> My Account
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-10">
        <section>
          <h1 className="font-display text-3xl">Catering & Events</h1>
          <p className="mt-2 text-muted-foreground">
            Tell us about your event — we'll bring the good coffee, and the bad manners.
          </p>
        </section>

        <form onSubmit={submit} className="glass rounded-2xl p-6 grid gap-4">
          <h2 className="font-display text-2xl">New Request</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Event type *</Label>
              <select
                name="event_type"
                required
                defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Select…
                </option>
                <option value="Corporate">Corporate</option>
                <option value="Private Party">Private Party</option>
                <option value="Pop-up">Pop-up</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <Input name="event_date" type="date" min={getSiteTodayInputValue()} />
            </div>
            <div className="grid gap-1.5">
              <Label>Time</Label>
              <Input name="event_time" type="time" />
            </div>
            <div className="grid gap-1.5">
              <Label>Location</Label>
              <Input name="location" placeholder="Address or venue" />
            </div>
            <div className="grid gap-1.5">
              <Label>Number of guests</Label>
              <Input name="guest_count" type="number" min={1} placeholder="50" />
            </div>
            <div className="grid gap-1.5">
              <Label>Budget range</Label>
              <select
                name="budget_range"
                defaultValue=""
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                <option value="Under $200">Under $200</option>
                <option value="$200-$500">$200-$500</option>
                <option value="$500-$1000">$500-$1000</option>
                <option value="$1000+">$1000+</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Specific requests / notes</Label>
            <Textarea name="notes" rows={4} placeholder="Drinks of interest, dietary needs…" />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-fire text-white hover:opacity-95 h-11 text-base"
          >
            {submitting ? "Sending…" : "Submit Request"}
          </Button>
        </form>

        <section>
          <h2 className="font-display text-2xl">Your Requests</h2>
          <div className="mt-4 space-y-3">
            {requests.length === 0 && (
              <p className="text-muted-foreground py-8 text-center">No requests yet.</p>
            )}
            {requests.map((r) => {
              const s = STATUS_LABELS[r.status] ?? {
                label: r.status,
                classes: "bg-slate-100 text-slate-700 border-slate-300",
              };
              return (
                <div key={r.id} className="glass rounded-xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg">{r.event_type}</p>
                      <p className="text-sm text-muted-foreground">
                        {r.event_date ? formatPlainDateInSiteTime(r.event_date) : "Date TBD"}
                        {r.event_time && ` · ${r.event_time.slice(0, 5)}`}
                        {r.guest_count && ` · ${r.guest_count} guests`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${s.classes}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {(r.location || r.budget_range || r.notes) && (
                    <div className="mt-3 text-sm space-y-1 text-muted-foreground">
                      {r.location && <p>📍 {r.location}</p>}
                      {r.budget_range && <p>💵 {r.budget_range}</p>}
                      {r.notes && <p className="italic">"{r.notes}"</p>}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Submitted{" "}
                    {formatInSiteTime(r.created_at, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
