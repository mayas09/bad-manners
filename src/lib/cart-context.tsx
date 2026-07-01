import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  id: string; // menu_item id or synthetic key
  name: string;
  unit_price_cents: number;
  quantity: number;
  special_notes?: string;
};

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  add: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  updateQty: (id: string, qty: number) => void;
  updateNotes: (id: string, notes: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  isOpen: boolean;
  setOpen: (v: boolean) => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "bm_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* localStorage unavailable or corrupted cart data */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* localStorage unavailable (e.g. private browsing) */
    }
  }, [items, hydrated]);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotalCents: items.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0),
      add: (it) =>
        setItems((prev) => {
          const qty = it.quantity ?? 1;
          const existing = prev.find((p) => p.id === it.id);
          if (existing)
            return prev.map((p) => (p.id === it.id ? { ...p, quantity: p.quantity + qty } : p));
          return [...prev, { ...it, quantity: qty }];
        }),
      updateQty: (id, qty) =>
        setItems((prev) =>
          qty <= 0
            ? prev.filter((p) => p.id !== id)
            : prev.map((p) => (p.id === id ? { ...p, quantity: qty } : p)),
        ),
      updateNotes: (id, notes) =>
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, special_notes: notes } : p))),
      remove: (id) => setItems((prev) => prev.filter((p) => p.id !== id)),
      clear: () => setItems([]),
      isOpen,
      setOpen,
    }),
    [items, isOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
