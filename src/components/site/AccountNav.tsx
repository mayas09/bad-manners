import { Link, useNavigate } from "@tanstack/react-router";
import { User, LogOut, ShoppingBag as OrdersIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/use-customer-auth";

export function AccountNav() {
  const auth = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  if (auth.loading) return <div className="size-9" />;

  if (!auth.user) {
    return (
      <Link to="/account/login" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:text-[--pink-deep]">
        <User className="size-4" /> Sign in
      </Link>
    );
  }

  const first = auth.profile?.first_name || auth.user.email?.split("@")[0] || "You";
  const initial = (first[0] || "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((s) => !s)} className="flex items-center gap-2 rounded-full glass px-2.5 py-1.5 text-sm hover:ring-1 ring-[--pink]/40">
        <span className="grid size-7 place-items-center rounded-full bg-fire text-white text-xs font-semibold">{initial}</span>
        <span className="hidden sm:inline font-medium max-w-24 truncate">{first}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-[--pink]/20 bg-white shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs text-muted-foreground truncate">{auth.user.email}</p>
          </div>
          <Link to="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
            <OrdersIcon className="size-4" /> My Orders
          </Link>
          <button onClick={async () => { await supabase.auth.signOut(); setOpen(false); navigate({ to: "/" }); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-red-600">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
