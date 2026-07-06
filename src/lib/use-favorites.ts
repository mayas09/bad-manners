import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/use-customer-auth";

export function useFavorites() {
  const auth = useCustomerAuth();
  const uid = auth.user?.id ?? null;
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) {
      setIds(new Set());
      setLoaded(true);
      return;
    }
    const { data } = await supabase
      .from("favorites")
      .select("menu_item_id")
      .eq("customer_id", uid);
    setIds(new Set((data ?? []).map((r: any) => r.menu_item_id)));
    setLoaded(true);
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (menuItemId: string) => {
      if (!uid) return { needsAuth: true as const };
      const isFav = ids.has(menuItemId);
      // Optimistic
      setIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(menuItemId);
        else next.add(menuItemId);
        return next;
      });
      if (isFav) {
        await supabase
          .from("favorites")
          .delete()
          .eq("customer_id", uid)
          .eq("menu_item_id", menuItemId);
      } else {
        await supabase
          .from("favorites")
          .insert({ customer_id: uid, menu_item_id: menuItemId });
      }
      return { needsAuth: false as const, isFav: !isFav };
    },
    [uid, ids],
  );

  return { ids, loaded, toggle, refresh, signedIn: !!uid };
}
