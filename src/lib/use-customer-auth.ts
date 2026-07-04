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
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (!u) return setState({ loading: false, user: null, profile: null });
    const { data: p } = await supabase
      .from("profiles")
      .select("first_name,last_name,phone,loyalty_count,free_drinks_available")
      .eq("id", u.id)
      .maybeSingle();
    setState({
      loading: false,
      user: { id: u.id, email: u.email ?? null },
      profile: (p as Profile) ?? {
        first_name: null,
        last_name: null,
        phone: null,
        loyalty_count: 0,
        free_drinks_available: 0,
      },
    });
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
