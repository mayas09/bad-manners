import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { claimAdminIfEligible } from "@/lib/admin-bootstrap.functions";

export type AdminAuthState = {
  loading: boolean;
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
};

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVITY_KEY = "bm_admin_last_activity";

function markActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* localStorage unavailable (e.g. private browsing) */
  }
}

export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({ loading: true, user: null, isAdmin: false });
  const claim = useServerFn(claimAdminIfEligible);

  useEffect(() => {
    let cancelled = false;

    async function load(userId: string | null, email: string | null) {
      if (!userId) {
        if (!cancelled) setState({ loading: false, user: null, isAdmin: false });
        return;
      }
      let { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      // Auto-promote allowlisted emails regardless of sign-in method (password or OAuth).
      if (!data && email) {
        await claim({ data: { userId, email } }).catch(() => {});
        ({ data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle());
      }
      if (!cancelled) setState({ loading: false, user: { id: userId, email }, isAdmin: !!data });
    }

    // Check idle timeout on mount
    try {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
      if (last && Date.now() - last > IDLE_TIMEOUT_MS) {
        supabase.auth.signOut().finally(() => {
          localStorage.removeItem(LAST_ACTIVITY_KEY);
          if (!cancelled) setState({ loading: false, user: null, isAdmin: false });
        });
        return;
      }
    } catch {
      /* localStorage unavailable (e.g. private browsing) */
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) markActivity();
      load(data.user?.id ?? null, data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem(LAST_ACTIVITY_KEY);
        } catch {
          /* localStorage unavailable (e.g. private browsing) */
        }
        if (!cancelled) setState({ loading: false, user: null, isAdmin: false });
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        markActivity();
        load(session?.user?.id ?? null, session?.user?.email ?? null);
      }
    });

    // Activity tracking + idle check every minute
    const onActivity = () => markActivity();
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const interval = window.setInterval(() => {
      try {
        const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);
        if (last && Date.now() - last > IDLE_TIMEOUT_MS) {
          supabase.auth.signOut();
        }
      } catch {
        /* localStorage unavailable (e.g. private browsing) */
      }
    }, 60 * 1000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
