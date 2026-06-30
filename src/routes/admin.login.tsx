import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { claimAdminIfEligible } from "@/lib/admin-bootstrap.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const claim = useServerFn(claimAdminIfEligible);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email) return;
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/admin/reset-password`,
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Password reset email sent. Check your inbox.");
        setMode("signin");
        return;
      }
      if (!password) return;
      const res =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email, password,
              options: { emailRedirectTo: `${window.location.origin}/admin` },
            });
      if (res.error) { toast.error(res.error.message); return; }
      const user = res.data.user;
      if (user) await claim({ data: { userId: user.id, email: user.email ?? email } }).catch(() => {});
      toast.success(mode === "signin" ? "Signed in." : "Account created.");
      navigate({ to: "/admin" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle brand glow background */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl bg-pink-600/40" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl bg-orange-500/40" />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur p-8 shadow-2xl">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-pink-400">Bad Manners</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {mode === "signin" ? "Admin sign in" : mode === "signup" ? "Create admin account" : "Reset password"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "forgot" ? "We'll email you a reset link." : "Manage your menu, photos, and business info."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className="text-slate-300">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" />
          </div>
          {mode !== "forgot" && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                {mode === "signin" && (
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-pink-400 hover:text-pink-300">
                    Forgot?
                  </button>
                )}
              </div>
              <Input id="password" name="password" type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required minLength={8}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500" />
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full h-11 bg-pink-600 hover:bg-pink-500 text-white">
            {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          {mode === "signin" && (
            <>No account?{" "}<button onClick={() => setMode("signup")} className="text-white underline">Sign up</button></>
          )}
          {mode === "signup" && (
            <>Already have an account?{" "}<button onClick={() => setMode("signin")} className="text-white underline">Sign in</button></>
          )}
          {mode === "forgot" && (
            <>Remembered it?{" "}<button onClick={() => setMode("signin")} className="text-white underline">Back to sign in</button></>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">← Back to site</Link>
        </div>
      </div>
    </div>
  );
}
