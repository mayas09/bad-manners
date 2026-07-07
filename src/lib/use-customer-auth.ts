import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  role: "admin" | "customer" | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuth | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<CustomerAuth, "refresh">>({
    loading: true,
    user: null,
    profile: null,
    role: null,
    isAdmin: false,
  });

  const load = useCallback(async () => {
    let u: { id: string; email: string | null } | null = null;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const sessionUser = session?.user ?? null;
      if (!sessionUser)
        return setState({ loading: false, user: null, profile: null, role: null, isAdmin: false });
      u = { id: sessionUser.id, email: sessionUser.email ?? null };
    } catch (err) {
      console.error("Failed to load auth user", err);
      return setState({ loading: false, user: null, profile: null, role: null, isAdmin: false });
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

      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id)
        .eq("role", "admin")
        .maybeSingle();
      const isAdmin = !!adminRole;

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
        role: isAdmin ? "admin" : "customer",
        isAdmin,
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
        role: "customer",
        isAdmin: false,
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void load();
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo(() => ({ ...state, refresh: load }), [state, load]);

  return createElement(CustomerAuthContext.Provider, { value }, children);
}

export function useCustomerAuth(): CustomerAuth {
  const auth = useContext(CustomerAuthContext);
  if (auth) return auth;

  throw new Error("useCustomerAuth must be used inside CustomerAuthProvider");
}
