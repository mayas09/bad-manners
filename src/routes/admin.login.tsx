import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { claimAdminIfEligible } from "@/lib/admin-bootstrap.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const claim = useServerFn(claimAdminIfEligible);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email || !password) return;
    setBusy(true);
    try {
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
        setBusy(false);
        return;
      }
      const user = res.data.user;
      if (user) {
        await claim({ data: { userId: user.id, email: user.email ?? email } }).catch(() => {});
      }
      toast.success(mode === "signin" ? "Signed in." : "Account created.");
      navigate({ to: "/admin" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Admin {mode === "signin" ? "Sign in" : "Sign up"}</h1>
          <p className="mt-1 text-sm text-slate-500">Bad Manners Coffee — content dashboard</p>
        </div>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} />
          </div>
          <Button type="submit" disabled={busy} className="w-full h-11">
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-500">
          {mode === "signin" ? (
            <>
              No account yet?{" "}
              <button onClick={() => setMode("signup")} className="text-slate-900 underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setMode("signin")} className="text-slate-900 underline">
                Sign in
              </button>
            </>
          )}
        </div>
        <div className="mt-8 text-center">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">← Back to site</Link>
        </div>
      </div>
      <Toaster richColors position="top-center" />
    </div>
  );
}
