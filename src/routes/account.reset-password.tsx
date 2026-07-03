import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/site/AuthShell";

export const Route = createFileRoute("/account/reset-password")({
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setErr(error.message);
      toast.success("Password updated.");
      // Route based on role
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: role } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "admin")
          .maybeSingle();
        navigate({ to: role ? "/admin" : "/account" });
      } else {
        navigate({ to: "/account/login" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Toaster richColors position="top-center" theme="dark" />
      <h1 className="text-2xl font-semibold text-white text-center">Set a new password</h1>
      <p className="mt-1 text-sm text-slate-400 text-center">
        {ready ? "Enter your new password below." : "Waiting for recovery link…"}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="password" className="text-slate-300">
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="bg-slate-800 border-slate-700 text-white focus-visible:ring-pink-500 focus-visible:border-pink-500"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm" className="text-slate-300">
            Confirm password
          </Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="bg-slate-800 border-slate-700 text-white focus-visible:ring-pink-500 focus-visible:border-pink-500"
          />
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <button
          type="submit"
          disabled={busy || !ready}
          className="w-full h-11 rounded-md bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white font-medium inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
