import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Hardcoded allowlist of emails permitted to be auto-promoted to admin on first sign-in.
const ADMIN_EMAILS = ["mayasallali09@gmail.com"];

/**
 * Idempotent: grants the admin role to the CURRENT authenticated caller if
 * their verified email is in the allowlist. Client input is ignored — the
 * user id and email come from the validated Supabase session claims only.
 */
export const claimAdminIfEligible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const claimEmail = (context.claims as { email?: unknown })?.email;
    const email = typeof claimEmail === "string" ? claimEmail.trim().toLowerCase() : "";

    if (!userId) return { granted: false, reason: "no_user" };
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return { granted: false, reason: "not_allowlisted" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (existing) return { granted: true, alreadyHad: true };

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (error) return { granted: false, reason: error.message };
    return { granted: true, alreadyHad: false };
  });
