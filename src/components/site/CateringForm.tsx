import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function CateringForm() {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      phone: String(fd.get("phone") || "").trim() || null,
      event_type: String(fd.get("event_type") || "").trim() || null,
      event_date: (String(fd.get("event_date") || "").trim() || null),
      guest_count: fd.get("guest_count") ? Number(fd.get("guest_count")) : null,
      message: String(fd.get("message") || "").trim(),
    };
    if (!payload.name || !payload.email || !payload.message) {
      toast.error("Name, email, and a message are required.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("catering_inquiries").insert(payload);
    setSending(false);
    if (error) {
      toast.error("Couldn't send. Try again or DM us on Instagram.");
      return;
    }
    setDone(true);
    toast.success("Got it — Ash will be in touch soon.");
    (e.target as HTMLFormElement).reset();
  }

  if (done) {
    return (
      <div className="rounded-2xl glass p-8 text-center">
        <p className="font-display text-3xl text-fire">Sent.</p>
        <p className="mt-2 text-muted-foreground">
          We'll get back to you within a couple of business days. ✦
        </p>
        <Button variant="outline" className="mt-6" onClick={() => setDone(false)}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl glass p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Your name" required>
          <Input id="name" name="name" placeholder="Mona Lisa" required />
        </Field>
        <Field id="email" label="Email" required>
          <Input id="email" name="email" type="email" placeholder="you@domain.com" required />
        </Field>
        <Field id="phone" label="Phone (optional)">
          <Input id="phone" name="phone" type="tel" placeholder="(828) ___-____" />
        </Field>
        <Field id="event_type" label="Event type">
          <Input id="event_type" name="event_type" placeholder="Wedding, market, office…" />
        </Field>
        <Field id="event_date" label="Event date">
          <Input id="event_date" name="event_date" type="date" />
        </Field>
        <Field id="guest_count" label="Guest count">
          <Input id="guest_count" name="guest_count" type="number" min={1} placeholder="50" />
        </Field>
      </div>
      <Field id="message" label="Tell us about it" required>
        <Textarea id="message" name="message" rows={5} required placeholder="What you're imagining, drinks of interest, location…" />
      </Field>
      <Button type="submit" disabled={sending} className="bg-fire text-white hover:opacity-95 h-11 text-base">
        {sending ? "Sending…" : "Send Inquiry"}
      </Button>
    </form>
  );
}

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}{required && <span className="text-[--pink-deep]"> *</span>}
      </Label>
      {children}
    </div>
  );
}
