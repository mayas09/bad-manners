import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { formatCents } from "@/lib/price-utils";
import { useSiteContent } from "@/components/site/use-site-content";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

/** Generate 15-minute pickup slots between now+15min and shop close today. */
function generatePickupSlots(hoursStr: string): { value: string; label: string }[] {
  // hoursStr like "8:00 AM – 3:00 PM"
  const parse = (s: string) => {
    const m = s.trim().match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (/PM/i.test(m[3]) && h !== 12) h += 12;
    if (/AM/i.test(m[3]) && h === 12) h = 0;
    return { h, min };
  };
  const parts = hoursStr.split(/[–-]/);
  if (parts.length !== 2) return [];
  const openT = parse(parts[0]);
  const closeT = parse(parts[1]);
  if (!openT || !closeT) return [];
  const now = new Date();
  const open = new Date(now);
  open.setHours(openT.h, openT.min, 0, 0);
  const close = new Date(now);
  close.setHours(closeT.h, closeT.min, 0, 0);
  const start = new Date(Math.max(now.getTime() + 15 * 60 * 1000, open.getTime()));
  // Round up to next 15 min
  const rem = start.getMinutes() % 15;
  if (rem) start.setMinutes(start.getMinutes() + (15 - rem), 0, 0);
  const slots: { value: string; label: string }[] = [];
  for (let t = new Date(start); t <= close; t = new Date(t.getTime() + 15 * 60 * 1000)) {
    slots.push({
      value: t.toISOString(),
      label: t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });
  }
  return slots;
}

function CheckoutPage() {
  const cart = useCart();
  const auth = useCustomerAuth();
  const nav = useNavigate();
  const content = useSiteContent();
  const createSession = useServerFn(createCheckoutSession);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pickup, setPickup] = useState("");

  useEffect(() => {
    if (!auth.loading && !auth.user)
      nav({ to: "/account/login", search: { next: "/checkout" } as any });
  }, [auth.loading, auth.user, nav]);

  useEffect(() => {
    if (auth.profile) {
      setName([auth.profile.first_name, auth.profile.last_name].filter(Boolean).join(" "));
      setPhone(auth.profile.phone ?? "");
    }
  }, [auth.profile]);

  const slots = useMemo(() => {
    if (!content.loaded && content.hours.length === 0) return [];
    const dayIdx = new Date().getDay(); // 0=Sun
    // Match by label heuristic
    const label =
      dayIdx === 0 || dayIdx === 6
        ? content.hours.find((h) => /sat|sun/i.test(h.label))
        : content.hours.find((h) => /mon|tue|wed|thu|fri|weekday/i.test(h.label));
    return generatePickupSlots(label?.hours_text ?? "8:00 AM – 3:00 PM");
  }, [content.hours, content.loaded]);

  useEffect(() => {
    if (slots.length && !pickup) setPickup(slots[0].value);
  }, [slots, pickup]);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.user || cart.items.length === 0) return;
    if (!pickup) return toast.error("Pick a pickup time");
    if (!name.trim() || !phone.trim()) return toast.error("Name and phone required");
    setBusy(true);
    try {
      const subtotal = cart.subtotalCents;
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          customer_id: auth.user.id,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_email: auth.user.email,
          subtotal_cents: subtotal,
          total_cents: subtotal,
          pickup_time: pickup,
          order_notes: notes || null,
        })
        .select("id")
        .single();
      if (error || !order) {
        toast.error(error?.message || "Order failed");
        return;
      }

      const { error: iErr } = await supabase.from("order_items").insert(
        cart.items.map((it) => ({
          order_id: order.id,
          menu_item_id: it.id.startsWith("menu:") ? it.id.slice(5) : null,
          name: it.name,
          quantity: it.quantity,
          unit_price_cents: it.unit_price_cents,
          special_notes: it.special_notes || null,
        })),
      );
      if (iErr) {
        toast.error(iErr.message);
        return;
      }

      const res = await createSession({
        data: { orderId: order.id, originUrl: window.location.origin },
      });
      if (res?.url) {
        cart.clear();
        window.location.href = res.url;
      } else {
        toast.error("Could not start payment");
      }
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
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
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← Keep shopping
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 grid gap-8 md:grid-cols-[1fr_360px]">
        <form onSubmit={placeOrder} className="space-y-6">
          <div>
            <h1 className="font-display text-3xl">Checkout</h1>
            <p className="text-sm text-muted-foreground">Pickup only. Pay securely with Stripe.</p>
          </div>
          <section className="glass rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-xl">Your details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Full name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  type="tel"
                  maxLength={20}
                />
              </div>
            </div>
          </section>
          <section className="glass rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-xl">Pickup time (today)</h2>
            {slots.length === 0 ? (
              <p className="text-sm text-red-600">Shop is closed for pickup today.</p>
            ) : (
              <select
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2"
              >
                {slots.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </section>
          <section className="glass rounded-2xl p-5 space-y-2">
            <h2 className="font-display text-xl">Order notes (optional)</h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Anything the barista should know?"
            />
          </section>
          <Button
            type="submit"
            disabled={busy || cart.items.length === 0 || slots.length === 0}
            className="w-full h-12 bg-fire text-white text-base"
          >
            {busy ? "Preparing…" : `Pay ${formatCents(cart.subtotalCents)} with Stripe`}
          </Button>
        </form>

        <aside className="glass rounded-2xl p-5 h-fit sticky top-4">
          <h2 className="font-display text-xl">Summary</h2>
          <div className="mt-3 space-y-2">
            {cart.items.length === 0 && (
              <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            )}
            {cart.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span>
                  {it.quantity}× {it.name}
                </span>
                <span className="text-fire font-semibold">
                  {formatCents(it.quantity * it.unit_price_cents)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[--pink]/20 flex justify-between font-display text-xl">
            <span>Total</span>
            <span className="text-fire">{formatCents(cart.subtotalCents)}</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
