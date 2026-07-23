import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { placePickupOrder } from "@/lib/pickup-order.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { formatCents } from "@/lib/price-utils";
import { useSiteContent } from "@/components/site/use-site-content";
import { useBusinessSettings, generatePickupSlotsForToday } from "@/lib/business-hours";
import { formatInSiteTime } from "@/lib/time-utils";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

const STRIPE_DRAFT_KEY = "bm_stripe_checkout_draft_v1";

// Pickup slot generation lives in @/lib/business-hours and reads from the
// business_settings table so admin hours changes take effect immediately.

function CheckoutPage() {
  const cart = useCart();
  const search = useSearch({ from: "/checkout" }) as { cancelled?: string };
  const auth = useCustomerAuth();
  const nav = useNavigate();
  const content = useSiteContent();
  const createSession = useServerFn(createCheckoutSession);
  const submitPickupOrder = useServerFn(placePickupOrder);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pickup, setPickup] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "pickup">("stripe");
  const [redeemFreeDrink, setRedeemFreeDrink] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const freeDrinksAvailable = auth.profile?.free_drinks_available ?? 0;

  const cheapestItem = useMemo(() => {
    if (cart.items.length === 0) return null;
    return cart.items.reduce((min, it) => (it.unit_price_cents < min.unit_price_cents ? it : min));
  }, [cart.items]);

  const discountCents =
    redeemFreeDrink && freeDrinksAvailable > 0 && cheapestItem ? cheapestItem.unit_price_cents : 0;
  const discountedTotalCents = Math.max(0, cart.subtotalCents - discountCents);

  useEffect(() => {
    if (!auth.loading && !auth.user) nav({ to: "/account/login", search: { next: "/checkout" } });
    if (!auth.loading && auth.role === "admin") nav({ to: "/admin" });
  }, [auth.loading, auth.user, auth.role, nav]);

  useEffect(() => {
    if (search.cancelled !== "1") return;
    setPaymentError("Payment was not completed. Please try again.");
    try {
      const raw = sessionStorage.getItem(STRIPE_DRAFT_KEY);
      if (!raw || cart.items.length > 0) return;
      const draft = JSON.parse(raw);
      if (Array.isArray(draft.items)) {
        draft.items.forEach((it: Parameters<typeof cart.add>[0]) => cart.add(it));
      }
      if (typeof draft.customerName === "string") setName(draft.customerName);
      if (typeof draft.customerPhone === "string") setPhone(draft.customerPhone);
      if (typeof draft.orderNotes === "string") setNotes(draft.orderNotes);
      if (typeof draft.pickupTime === "string") setPickup(draft.pickupTime);
    } catch {
      /* corrupted Stripe draft; leave the current cart alone */
    }
  }, [search.cancelled, cart]);

  useEffect(() => {
    if (auth.profile) {
      setName([auth.profile.first_name, auth.profile.last_name].filter(Boolean).join(" "));
      setPhone(auth.profile.phone ?? "");
    }
  }, [auth.profile]);

  const business = useBusinessSettings();
  const { slots, closed: shopClosedToday } = useMemo(
    () => generatePickupSlotsForToday(business.days),
    [business.days],
  );

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
      const total = discountedTotalCents;

      if (paymentMethod === "stripe") {
        const orderId = crypto.randomUUID();
        const draft = {
          orderId,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: auth.user.email,
          subtotalCents: subtotal,
          totalCents: total,
          discountCents,
          pickupTime: pickup,
          orderNotes: notes || null,
          items: cart.items.map((it) => ({ ...it, special_notes: it.special_notes || null })),
        };
        sessionStorage.setItem(STRIPE_DRAFT_KEY, JSON.stringify(draft));
        const res = await createSession({
          data: { ...draft, originUrl: window.location.origin },
        });
        if (res?.url) {
          window.location.href = res.url;
        } else {
          toast.error("Could not start payment");
        }
        return;
      }

      // Pay-on-pickup: send only identifiers + quantities. The server
      // recomputes prices, totals, and any free-drink discount from the DB.
      const pickupItems = cart.items
        .map((it) => {
          const menu_item_id = it.id.startsWith("menu:") ? it.id.slice(5) : it.id;
          return {
            menu_item_id,
            quantity: it.quantity,
            special_notes: it.special_notes || null,
          };
        })
        .filter((it) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.menu_item_id),
        );

      if (pickupItems.length !== cart.items.length) {
        throw new Error("Cart contains an item that isn't on the menu");
      }

      const result = await submitPickupOrder({
        data: {
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: auth.user.email ?? null,
          pickupTime: pickup,
          orderNotes: notes || null,
          paymentStatus: paymentMethod === "pickup" ? "pay_on_pickup" : "unpaid",
          redeemFreeDrink: discountCents > 0,
          items: pickupItems,
        },
      });

      cart.clear();
      nav({ to: "/order/$orderId", params: { orderId: result.orderId } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
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
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← Keep shopping
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 grid gap-8 md:grid-cols-[1fr_360px]">
        <form onSubmit={placeOrder} className="space-y-6">
          <div>
            <h1 className="font-display text-3xl">Checkout</h1>
            <p className="text-sm text-muted-foreground">
              Pickup only. Pay now with Stripe, or pay in person at pickup.
            </p>
            {paymentMethod === "stripe" && import.meta.env.DEV && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-100/70 px-3 py-1 text-xs font-semibold text-amber-900">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Stripe TEST MODE — use card 4242 4242 4242 4242, any future expiry, any CVC
              </div>
            )}
            {paymentError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {paymentError}
              </div>
            )}
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
              <p className="text-sm text-red-600">
                {shopClosedToday ? "Closed today. Please check back tomorrow." : "No pickup slots left today."}
              </p>
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
          {freeDrinksAvailable > 0 && (
            <section className="glass rounded-2xl p-5">
              <label
                htmlFor="redeem-free-drink"
                className="flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="font-semibold text-slate-900">
                  Redeem a free drink? ({freeDrinksAvailable} available)
                </span>
                <Switch
                  id="redeem-free-drink"
                  checked={redeemFreeDrink}
                  onCheckedChange={setRedeemFreeDrink}
                />
              </label>
            </section>
          )}
          <section className="glass rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-xl">How would you like to pay?</h2>
            <RadioGroup
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "stripe" | "pickup")}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label
                htmlFor="pay-stripe"
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  paymentMethod === "stripe" ? "border-fire bg-fire/5" : "border-slate-200 bg-white"
                }`}
              >
                <RadioGroupItem value="stripe" id="pay-stripe" className="mt-1" />
                <span>
                  <span className="block font-semibold text-slate-900">Pay now</span>
                  <span className="block text-sm text-muted-foreground">
                    Pay securely online with Stripe.
                  </span>
                </span>
              </label>
              <label
                htmlFor="pay-pickup"
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  paymentMethod === "pickup" ? "border-fire bg-fire/5" : "border-slate-200 bg-white"
                }`}
              >
                <RadioGroupItem value="pickup" id="pay-pickup" className="mt-1" />
                <span>
                  <span className="block font-semibold text-slate-900">Pay on pickup</span>
                  <span className="block text-sm text-muted-foreground">
                    Reserve your order and pay in person at the counter.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </section>
          <Button
            type="submit"
            disabled={busy || cart.items.length === 0 || slots.length === 0}
            className="w-full h-12 bg-fire text-white text-base"
          >
            {busy
              ? "Preparing…"
              : paymentMethod === "stripe"
                ? `Pay ${formatCents(discountedTotalCents)} with Stripe`
                : `Place order — pay ${formatCents(discountedTotalCents)} at pickup`}
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
            {discountCents > 0 && (
              <div className="flex justify-between text-sm text-[--pink-deep] font-semibold">
                <span>Discount</span>
                <span>-{formatCents(discountCents)} (Free drink)</span>
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-[--pink]/20 flex justify-between font-display text-xl">
            <span>Total</span>
            <span className="text-fire">{formatCents(discountedTotalCents)}</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
