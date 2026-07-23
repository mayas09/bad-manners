import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell, GoogleButton } from "@/components/site/AuthShell";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/account/signup")({
  validateSearch: searchSchema,
  component: SignupPage,
});

type Errors = Partial<Record<"first" | "last" | "email" | "password" | "confirm", string>>;

function resolveSignupDestination(next: string | undefined) {
  return next === "/checkout" ? "/checkout" : "/account";
}

function SignupPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/account/signup" });
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const first = String(fd.get("first_name") || "").trim();
    const last = String(fd.get("last_name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");

    const e2: Errors = {};
    if (!first) e2.first = "First name is required";
    if (!last) e2.last = "Last name is required";
    if (!email) e2.email = "Email is required";
    if (password.length < 6) e2.password = "At least 6 characters";
    if (confirm !== password) e2.confirm = "Passwords do not match";
    setErrs(e2);
    if (Object.keys(e2).length) return;

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { first_name: first, last_name: last },
        },
      });
      if (error) {
        setErrs({ email: error.message });
        return;
      }
      // If the project requires email confirmation, `session` will be null.
      if (!data.session) {
        setPendingEmail(email);
        toast.success("Please check your email to confirm your account 🖤");
        return;
      }
      toast.success("Account created!");
      nav({ to: resolveSignupDestination(search.next) });
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (error) toast.error(error.message);
  }



  if (pendingEmail) {
    return (
      <AuthShell>
        <Toaster richColors position="top-center" theme="dark" />
        <p className="text-xs uppercase tracking-[0.3em] text-pink-400 text-center">Bad Manners</p>
        <h1 className="mt-2 text-2xl font-semibold text-white text-center">
          Confirm your email 🖤
        </h1>
        <p className="mt-3 text-sm text-slate-300 text-center">
          We sent a confirmation link to <span className="text-pink-300">{pendingEmail}</span>.
          Click it to activate your account, then sign in.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={async () => {
              const { error } = await supabase.auth.resend({
                type: "signup",
                email: pendingEmail,
              });
              if (error) toast.error(error.message);
              else toast.success("Confirmation email re-sent");
            }}
            className="h-11 rounded-md bg-pink-600 hover:bg-pink-500 text-white font-medium"
          >
            Resend confirmation email
          </button>
          <Link
            to="/account/login"
            className="text-center text-sm text-slate-400 hover:text-slate-200"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Toaster richColors position="top-center" theme="dark" />
      <p className="text-xs uppercase tracking-[0.3em] text-pink-400 text-center">Bad Manners</p>
      <h1 className="mt-2 text-2xl font-semibold text-white text-center">Create your account</h1>
      <p className="mt-1 text-sm text-slate-400 text-center">
        Order ahead. Skip the line. Get more coffee.
      </p>


      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="first_name"
            label="First name"
            error={errs.first}
            inputProps={{ maxLength: 50, autoComplete: "given-name", required: true }}
          />
          <Field
            id="last_name"
            label="Last name"
            error={errs.last}
            inputProps={{ maxLength: 50, autoComplete: "family-name", required: true }}
          />
        </div>
        <Field
          id="email"
          label="Email"
          error={errs.email}
          inputProps={{ type: "email", autoComplete: "email", required: true }}
        />
        <Field
          id="password"
          label="Password"
          error={errs.password}
          inputProps={{
            type: "password",
            autoComplete: "new-password",
            required: true,
            minLength: 6,
          }}
        />
        <Field
          id="confirm"
          label="Confirm password"
          error={errs.confirm}
          inputProps={{
            type: "password",
            autoComplete: "new-password",
            required: true,
            minLength: 6,
          }}
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 mt-2 rounded-md bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white font-medium inline-flex items-center justify-center gap-2 transition-colors"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Create account
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-slate-800" /> or <span className="h-px flex-1 bg-slate-800" />
      </div>
      <GoogleButton onClick={onGoogle} />

      <p className="mt-6 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link
          to="/account/login"
          search={search.next ? { next: search.next } : undefined}
          className="text-pink-400 font-medium hover:text-pink-300"
        >
          Sign in
        </Link>
      </p>
      <p className="mt-4 text-center">
        <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">
          ← Back to site
        </Link>
      </p>
    </AuthShell>
  );
}

function Field({
  id,
  label,
  error,
  inputProps,
}: {
  id: string;
  label: string;
  error?: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-slate-300">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        {...inputProps}
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-pink-500 focus-visible:border-pink-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
