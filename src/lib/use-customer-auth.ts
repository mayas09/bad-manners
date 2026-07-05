import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  loyalty_count: number;
  free_drinks_available: number;
};

export type CustomerAuth = {
  loading: boolean;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  refresh: () => Promise<void>;
};

export function useCustomerAuth(): CustomerAuth {
  const [state, setState] = useState<Omit<CustomerAuth, "refresh">>({
    loading: true,
    user: null,
    profile: null,
  });

  async function load() {
    let u: { id: string; email: string | null } | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setState({ loading: false, user: null, profile: null });
      u = { id: data.user.id, email: data.user.email ?? null };
    } catch (err) {
      console.error("Failed to load auth user", err);
      return setState({ loading: false, user: null, profile: null });
    }

    try {
      let p = (
        await supabase
          .from("profiles")
          .select("first_name,last_name,phone,loyalty_count,free_drinks_available")
          .eq("id", u.id)
          .maybeSingle()
      ).data;

      if (!p) {
        // Profile row missing (e.g. Google OAuth users who signed up before
        // the profile trigger existed) - create it before reading from it.
        await supabase
          .from("profiles")
          .upsert({ id: u.id, email: u.email }, { onConflict: "id", ignoreDuplicates: true });
        p = (
          await supabase
            .from("profiles")
            .select("first_name,last_name,phone,loyalty_count,free_drinks_available")
            .eq("id", u.id)
            .maybeSingle()
        ).data;
      }

      setState({
        loading: false,
        user: u,
        profile: {
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          phone: p?.phone ?? null,
          loyalty_count: p?.loyalty_count ?? 0,
          free_drinks_available: p?.free_drinks_available ?? 0,
        },
      });
    } catch (err) {
      console.error("Failed to load customer profile", err);
      setState({
        loading: false,
        user: u,
        profile: {
          first_name: null,
          last_name: null,
          phone: null,
          loyalty_count: 0,
          free_drinks_available: 0,
        },
      });
    }
  }

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { ...state, refresh: load };
}
