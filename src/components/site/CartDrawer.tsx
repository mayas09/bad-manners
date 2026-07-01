import { useCart } from "@/lib/cart-context";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import { ShoppingCart, X, Plus, Minus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatCents } from "@/lib/price-utils";

export function CartButton() {
  const cart = useCart();
  return (
    <button
      onClick={() => cart.setOpen(true)}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-fire text-white px-4 py-3 shadow-2xl hover:opacity-95 transition"
      aria-label="Open cart"
    >
      <ShoppingCart className="size-5" />
      <span className="font-semibold text-sm">{cart.count}</span>
    </button>
  );
}

export function CartDrawer() {
  const cart = useCart();
  const auth = useCustomerAuth();
  const navigate = useNavigate();

  if (!cart.isOpen) return null;

  const handleCheckout = () => {
    cart.setOpen(false);
    if (!auth.user) {
      navigate({ to: "/account/login", search: { next: "/checkout" } as any });
    } else {
      navigate({ to: "/checkout" });
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => cart.setOpen(false)} />
      <aside className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-background shadow-2xl flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-[--pink]/20">
          <h2 className="font-display text-2xl">Your cart</h2>
          <button onClick={() => cart.setOpen(false)} aria-label="Close cart">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.items.length === 0 && (
            <p className="text-center text-muted-foreground py-16">
              Nothing here yet. Add something delicious.
            </p>
          )}
          {cart.items.map((it) => (
            <div key={it.id} className="glass rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg truncate">{it.name}</p>
                  <p className="text-sm text-fire font-semibold">
                    {formatCents(it.unit_price_cents)}
                  </p>
                </div>
                <button
                  onClick={() => cart.remove(it.id)}
                  className="text-muted-foreground hover:text-red-600 p-1"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => cart.updateQty(it.id, it.quantity - 1)}
                  className="grid size-8 place-items-center rounded-full border border-[--pink]/40"
                >
                  <Minus className="size-3" />
                </button>
                <span className="w-8 text-center font-semibold">{it.quantity}</span>
                <button
                  onClick={() => cart.updateQty(it.id, it.quantity + 1)}
                  className="grid size-8 place-items-center rounded-full border border-[--pink]/40"
                >
                  <Plus className="size-3" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Notes (e.g. oat milk)"
                value={it.special_notes ?? ""}
                onChange={(e) => cart.updateNotes(it.id, e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white/60 px-2 py-1.5 text-xs"
                maxLength={200}
              />
            </div>
          ))}
        </div>

        <footer className="border-t border-[--pink]/20 p-4 space-y-3">
          <div className="flex justify-between font-display text-xl">
            <span>Subtotal</span>
            <span className="text-fire">{formatCents(cart.subtotalCents)}</span>
          </div>
          <Button
            disabled={cart.items.length === 0}
            onClick={handleCheckout}
            className="w-full h-12 bg-fire text-white text-base"
          >
            {auth.user ? "Checkout" : "Sign in to checkout"}
          </Button>
          {!auth.user && (
            <p className="text-center text-xs text-muted-foreground">
              New here?{" "}
              <Link to="/account/signup" className="text-fire underline">
                Create an account
              </Link>
            </p>
          )}
        </footer>
      </aside>
    </div>
  );
}
