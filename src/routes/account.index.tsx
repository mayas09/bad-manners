import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { formatCents, parsePriceToCents } from "@/lib/price-utils";
import { formatInSiteTime } from "@/lib/time-utils";
import { useCart } from "@/lib/cart-context";
import { Heart, Plus } from "lucide-react";

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
  const cart = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loyaltyMilestone, setLoyaltyMilestone] = useState(5);
  const [favorites, setFavorites] = useState<
    { id: string; menu_item_id: string; name: string; price: string | null; image_url: string | null }[]
  >([]);

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
    const uid = auth.user.id;

    function loadOrders() {
      supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setOrders((data as Order[]) ?? []);
        });
    }
    loadOrders();

    // Keep the loyalty punch card and order list current when an admin
    // changes an order's status (e.g. marking it picked_up), since that's
    // when the loyalty_count trigger fires server-side.
    const channel = supabase
      .channel(`account-orders-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${uid}` },
        () => {
          loadOrders();
          auth.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    const uid = auth.user.id;
    (async () => {
      const { data } = await supabase
        .from("favorites")
        .select("id, menu_item_id, menu_items(name, price, image_url)")
        .eq("customer_id", uid);
      setFavorites(
        ((data as any[]) ?? []).map((r) => ({
          id: r.id,
          menu_item_id: r.menu_item_id,
          name: r.menu_items?.name ?? "Item",
          price: r.menu_items?.price ?? null,
          image_url: r.menu_items?.image_url ?? null,
        })),
      );
    })();
  }, [auth.user]);

  async function removeFavorite(favId: string) {
    setFavorites((f) => f.filter((x) => x.id !== favId));
    await supabase.from("favorites").delete().eq("id", favId);
  }

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
            {(showAllOrders ? orders : orders.slice(0, 3)).map((o) => (
              <div
                key={o.id}
                className="glass rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between"
              >
                <div className="min-w-0">
                  <p className="font-display text-lg">Order #{o.order_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatInSiteTime(o.created_at, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })} · Pickup{" "}
                    {formatInSiteTime(o.pickup_time, {
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
                    className="inline-flex items-center rounded-full border border-[--pink-deep] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[--pink-deep] transition-colors hover:bg-[--pink-deep] hover:text-white"
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
          {orders.length > 3 && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setShowAllOrders((s) => !s)}>
                {showAllOrders ? "Show less" : "Show all orders"}
              </Button>
            </div>
          )}
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
