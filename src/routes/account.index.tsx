import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { formatCents } from "@/lib/price-utils";

export const Route = createFileRoute("/account/")({
  component: AccountHome,
});

type Order = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  total_cents: number;
  pickup_time: string;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-300",
  picked_up: "bg-slate-100 text-slate-600 border-slate-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

function AccountHome() {
  const auth = useCustomerAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loyaltyMilestone, setLoyaltyMilestone] = useState(5);

  useEffect(() => {
    if (!auth.loading && !auth.user) nav({ to: "/account/login" });
  }, [auth.loading, auth.user, nav]);

  useEffect(() => {
    if (auth.profile) {
      setFirst(auth.profile.first_name ?? "");
      setLast(auth.profile.last_name ?? "");
      setPhone(auth.profile.phone ?? "");
    }
  }, [auth.profile]);

  useEffect(() => {
    supabase
      .from("business_info")
      .select("value")
      .eq("key", "loyalty_milestone")
      .maybeSingle()
      .then(({ data }) => {
        const n = Number(data?.value);
        if (Number.isFinite(n) && n > 0) setLoyaltyMilestone(n);
      });
  }, []);
  
  useEffect(() => {
    if (!auth.user) return;
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as Order[]) ?? []);
      });
  }, [auth.user]);

  async function saveProfile() {
    if (!auth.user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").upsert({
      id: auth.user.id,
      first_name: first,
      last_name: last,
      phone: phone || null,
    });
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    auth.refresh();
  }

  async function cancelOrder(id: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "pending");
    if (error) return toast.error(error.message);
    toast.success("Order cancelled");
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)));
  }

  if (auth.loading || !auth.user)
    return <div className="min-h-screen grid place-items-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-[--pink]/20 py-4 px-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <Link to="/" className="font-display text-xl">
            Bad <span className="text-fire">Manners</span>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              nav({ to: "/" });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-10">
        <section className="flex flex-wrap gap-3">
          <Link
            to="/account/events"
            className="inline-flex items-center gap-2 rounded-full bg-[--pink-deep] text-white px-4 py-2 text-sm font-semibold hover:opacity-95"
          >
            Catering & Events →
          </Link>
        </section>
        <section>
          <h1 className="font-display text-3xl">My Orders</h1>
          <div className="mt-4 space-y-3">
            {orders.length === 0 && (
              <p className="text-muted-foreground py-8 text-center">
                No orders yet.{" "}
                <Link to="/" className="text-fire underline">
                  Grab a drink
                </Link>
                .
              </p>
            )}
            {orders.map((o) => (
              <div
                key={o.id}
                className="glass rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg">Order #{o.order_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()} · Pickup{" "}
                    {new Date(o.pickup_time).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${STATUS_COLORS[o.status] ?? ""}`}
                  >
                    {o.status.replace("_", " ")}
                  </span>
                  <span className="font-display text-lg text-fire">
                    {formatCents(o.total_cents)}
                  </span>
                  <Link
                    to="/account/receipt/$orderId"
                    params={{ orderId: o.id }}
                    className="text-xs font-semibold uppercase tracking-widest text-[--pink-deep] hover:underline"
                  >
                    Receipt
                  </Link>
                  {o.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl p-6">
          <h2 className="font-display text-2xl">Loyalty punch card</h2>
          {(auth.profile?.free_drinks_available ?? 0) > 0 && (
            <div className="mt-3 rounded-xl bg-[--pink-deep] px-4 py-3 font-semibold text-white">
              You have {auth.profile!.free_drinks_available} free drink
              {auth.profile!.free_drinks_available > 1 ? "s" : ""} available! 🎉
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {Array.from({ length: loyaltyMilestone }).map((_, i) => (
              <span
                key={i}
                className={`size-8 rounded-full border-2 ${
                  i < (auth.profile?.loyalty_count ?? 0)
                    ? "border-[--pink-deep] bg-[--pink-deep]"
                    : "border-[--pink]/40 bg-transparent"
                }`}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {auth.profile?.loyalty_count ?? 0} / {loyaltyMilestone} punches toward your free drink
          </p>
        </section>
        
        <section className="glass rounded-2xl p-6">
          <h2 className="font-display text-2xl">Profile</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>First name</Label>
              <Input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={50} />
            </div>
            <div className="grid gap-1.5">
              <Label>Last name</Label>
              <Input value={last} onChange={(e) => setLast(e.target.value)} maxLength={50} />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                maxLength={20}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input value={auth.user.email ?? ""} disabled />
            </div>
          </div>
          <Button
            onClick={saveProfile}
            disabled={savingProfile}
            className="mt-4 bg-fire text-white"
          >
            Save profile
          </Button>
        </section>
      </main>
    </div>
  );
}
