import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/admin`,
    });
    if (result.error) toast.error("Google sign-in failed");
  }

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
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Password reset email sent. Check your inbox.");
        setMode("signin");
        return;
      }
      if (!password) return;
      const res =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/admin` },
            });
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      const user = res.data.user;
      if (user)
        await claim({ data: { userId: user.id, email: user.email ?? email } }).catch(() => {});
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
            {mode === "signin"
              ? "Admin sign in"
              : mode === "signup"
                ? "Create admin account"
                : "Reset password"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "forgot"
              ? "We'll email you a reset link."
              : "Manage your menu, photos, and business info."}
          </p>
        </div>

        {mode !== "forgot" && (
          <>
            <Button
              onClick={google}
              variant="outline"
              type="button"
              className="w-full mt-6 h-11 bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              <svg viewBox="0 0 24 24" className="size-4 mr-2">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
                />
              </svg>
              Continue with Google
            </Button>
            <div className="my-4 flex items-center gap-2 text-xs text-slate-500">
              <div className="h-px flex-1 bg-slate-700" /> or{" "}
              <div className="h-px flex-1 bg-slate-700" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="mt-2 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email" className="text-slate-300">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
          {mode !== "forgot" && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-slate-300">
                  Password
                </Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-xs text-pink-400 hover:text-pink-300"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={busy}
            className="w-full h-11 bg-pink-600 hover:bg-pink-500 text-white"
          >
            {busy
              ? "…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          {mode === "signin" && (
            <>
              No account?{" "}
              <button onClick={() => setMode("signup")} className="text-white underline">
                Sign up
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="text-white underline">
                Sign in
              </button>
            </>
          )}
          {mode === "forgot" && (
            <>
              Remembered it?{" "}
              <button onClick={() => setMode("signin")} className="text-white underline">
                Back to sign in
              </button>
            </>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}
