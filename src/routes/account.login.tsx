import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { useCustomerAuth } from "@/lib/use-customer-auth";
import { useServerFn } from "@tanstack/react-start";
import { claimAdminIfEligible } from "@/lib/admin-bootstrap.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell, GoogleButton } from "@/components/site/AuthShell";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/account/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

async function resolveRedirect(userId: string): Promise<string> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return data ? "/admin" : "/account";
}

function LoginPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/account/login" });
  const auth = useCustomerAuth();
  const claim = useServerFn(claimAdminIfEligible);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);
  const navigatingRef = useRef(false);

  const navigateAfterLogin = useCallback(
    async (userId: string, email: string | null) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      await claim().catch(() => {});
      const roleDest = await resolveRedirect(userId);
      const requestedDest = search.next as string | undefined;
      const dest =
        roleDest === "/admin" ? "/admin" : requestedDest === "/checkout" ? "/checkout" : roleDest;
      nav({ to: dest });
    },
    [claim, nav, search.next],
  );

  useEffect(() => {
    if (auth.loading || !auth.user) return;
    void navigateAfterLogin(auth.user.id, auth.user.email);
  }, [auth.loading, auth.user, navigateAfterLogin]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailErr(null);
    setPassErr(null);
    setNeedsConfirm(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    if (!email) return setEmailErr("Email is required");

    if (forgot) {
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/account/reset-password`,
        });
        if (error) return toast.error(error.message);
        toast.success("Password reset email sent. Check your inbox.");
        setForgot(false);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!password) return setPassErr("Password is required");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (/confirm/i.test(error.message)) {
          setNeedsConfirm(email);
          setPassErr(null);
        } else {
          setPassErr(error.message);
        }
        return;
      }
      if (data.user) {
        await supabase.auth.getSession();
        await auth.refresh();
        toast.success("Welcome back!");
        await navigateAfterLogin(data.user.id, data.user.email ?? email);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirm() {
    if (!needsConfirm) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: needsConfirm });
    if (error) toast.error(error.message);
    else toast.success("Confirmation email re-sent");
  }

  async function onGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (error) toast.error(error.message);
  }



  return (
    <AuthShell>
      <Toaster richColors position="top-center" theme="dark" />
      <p className="text-xs uppercase tracking-[0.3em] text-pink-400 text-center">Bad Manners</p>
      <h1 className="mt-2 text-2xl font-semibold text-white text-center">
        {forgot ? "Reset your password" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-slate-400 text-center">
        {forgot ? "We'll email you a secure reset link." : "Welcome back. Sign in to your account."}
      </p>


      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email" className="text-slate-300">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-pink-500 focus-visible:border-pink-500"
          />
          {emailErr && <p className="text-xs text-red-400">{emailErr}</p>}
        </div>

        {!forgot && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-slate-300">
                Password
              </Label>
              <button
                type="button"
                onClick={() => setForgot(true)}
                className="text-xs text-pink-400 hover:text-pink-300"
              >
                Forgot?
              </button>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-pink-500 focus-visible:border-pink-500"
            />
            {passErr && <p className="text-xs text-red-400">{passErr}</p>}
            {needsConfirm && (
              <div className="rounded-md border border-pink-500/40 bg-pink-500/10 px-3 py-2 text-xs text-pink-100">
                Please confirm your email first. 🖤{" "}
                <button
                  type="button"
                  onClick={resendConfirm}
                  className="underline font-semibold hover:text-white"
                >
                  Resend confirmation email
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-md bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white font-medium inline-flex items-center justify-center gap-2 transition-colors"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {forgot ? "Send reset link" : "Sign in"}
        </button>

        {forgot && (
          <button
            type="button"
            onClick={() => setForgot(false)}
            className="w-full text-xs text-slate-400 hover:text-slate-200"
          >
            ← Back to sign in
          </button>
        )}
      </form>

      {!forgot && (
        <p className="mt-6 text-center text-sm text-slate-400">
          Don't have an account?{" "}
          <Link
            to="/account/signup"
            search={search}
            className="text-pink-400 font-medium hover:text-pink-300"
          >
            Sign up
          </Link>
        </p>
      )}
      <p className="mt-4 text-center">
        <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← Back to site
        </Link>
      </p>
    </AuthShell>
  );
}
