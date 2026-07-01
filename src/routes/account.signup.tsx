import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { z } from "zod";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/account/signup")({
  validateSearch: searchSchema,
  component: SignupPage,
});

function SignupPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/account/signup" });
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const first_name = String(fd.get("first_name") || "").trim();
    const last_name = String(fd.get("last_name") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: String(fd.get("email") || "").trim(),
        password: String(fd.get("password") || ""),
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { first_name, last_name },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.user) {
        // Ensure profile has phone (trigger sets names)
        await supabase
          .from("profiles")
          .upsert({ id: data.user.id, first_name, last_name, phone: phone || null });
      }
      toast.success("Account created!");
      nav({ to: (search.next as any) || "/" });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 py-12">
      <Toaster richColors position="top-center" />
      <div className="w-full max-w-md rounded-2xl glass p-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[--pink-deep]">Bad Manners</p>
          <h1 className="mt-2 font-display text-3xl">Create account</h1>
        </div>
        <Button onClick={google} variant="outline" className="w-full mt-6 h-11" type="button">
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
        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-[--pink]/30" /> or{" "}
          <div className="h-px flex-1 bg-[--pink]/30" />
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" required maxLength={50} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" maxLength={50} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" maxLength={20} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full h-11 bg-fire text-white">
            {busy ? "…" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have one?{" "}
          <Link
            to="/account/login"
            search={search as any}
            className="text-fire font-medium underline"
          >
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">
            ← Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}
