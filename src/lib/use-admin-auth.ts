import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdminAuthState = {
  loading: boolean;
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
};

export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({ loading: true, user: null, isAdmin: false });

  useEffect(() => {
    let cancelled = false;

    async function load(userId: string | null, email: string | null) {
      if (!userId) {
        if (!cancelled) setState({ loading: false, user: null, isAdmin: false });
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!cancelled) setState({ loading: false, user: { id: userId, email }, isAdmin: !!data });
    }

    supabase.auth.getUser().then(({ data }) => {
      load(data.user?.id ?? null, data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (!cancelled) setState({ loading: false, user: null, isAdmin: false });
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        load(session?.user?.id ?? null, session?.user?.email ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
