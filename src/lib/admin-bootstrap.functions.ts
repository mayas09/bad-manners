import { createServerFn } from "@tanstack/react-start";

// Hardcoded allowlist of emails permitted to be auto-promoted to admin on first sign-in.
const ADMIN_EMAILS = ["mayasallali09@gmail.com"];

/**
 * Idempotent: if the caller's email is in the allowlist and they don't already
 * hold the admin role, grant it. Safe to call after every successful sign-in.
 */
export const claimAdminIfEligible = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const email = (data.email || "").trim().toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return { granted: false, reason: "not_allowlisted" };
    if (!data.userId) return { granted: false, reason: "no_user" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", data.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (existing) return { granted: true, alreadyHad: true };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: "admin" });
    if (error) return { granted: false, reason: error.message };
    return { granted: true, alreadyHad: false };
  });
