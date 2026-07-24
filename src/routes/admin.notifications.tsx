import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/lib/use-admin-auth";
import { sendPushNotification } from "@/lib/push-send.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Users, User as UserIcon, Shield } from "lucide-react";

export const Route = createFileRoute("/admin/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Send Notifications · Bad Manners Admin" },
      { name: "description", content: "Send push notifications to customers." },
    ],
  }),
});

type Audience = "all" | "admins" | "user";
type Customer = { id: string; email: string | null; first_name: string | null; last_name: string | null };

function NotificationsPage() {
  const auth = useAdminAuth();
  const [audience, setAudience] = useState<Audience>("all");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [sending, setSending] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subCount, setSubCount] = useState<number | null>(null);

  useEffect(() => {
    if (!auth.isAdmin) return;
    (async () => {
      const [{ data: profiles }, { count }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,first_name,last_name")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("push_subscriptions" as any).select("id", { count: "exact", head: true }),
      ]);
      setCustomers((profiles ?? []) as Customer[]);
      setSubCount(count ?? 0);
    })();
  }, [auth.isAdmin]);

  async function send() {
    if (!title.trim()) return toast.error("Title is required");
    if (audience === "user" && !userId) return toast.error("Pick a customer");
    setSending(true);
    try {
      if (audience === "all") {
        // Fan out to every subscribed user.
        const { data: subs } = await supabase
          .from("push_subscriptions" as any)
          .select("user_id");
        const uniqueIds = Array.from(new Set((subs ?? []).map((s: any) => s.user_id as string)));
        if (uniqueIds.length === 0) {
          toast.error("No subscribers");
          return;
        }
        let sent = 0;
        await Promise.all(
          uniqueIds.map(async (uid) => {
            try {
              const res = await sendPushNotification({
                data: { userId: uid, title, body, url, tag: `broadcast-${Date.now()}` },
              });
              sent += res?.sent ?? 0;
            } catch (e) {
              console.error("push fail", uid, e);
            }
          }),
        );
        toast.success(`Sent ${sent} push notification${sent === 1 ? "" : "s"}`);
      } else if (audience === "admins") {
        const res = await sendPushNotification({
          data: { toAdmins: true, title, body, url, tag: `admin-${Date.now()}` },
        });
        toast.success(`Sent to ${res?.sent ?? 0} admin device${res?.sent === 1 ? "" : "s"}`);
      } else {
        const res = await sendPushNotification({
          data: { userId, title, body, url, tag: `direct-${Date.now()}` },
        });
        toast.success(`Sent to ${res?.sent ?? 0} device${res?.sent === 1 ? "" : "s"}`);
      }
      setTitle("");
      setBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  if (!auth.isAdmin) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Push Notifications</h1>
        <p className="text-sm text-slate-500">
          {subCount === null
            ? "Loading subscribers…"
            : `${subCount} device${subCount === 1 ? "" : "s"} subscribed.`}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <Label className="mb-2 block">Audience</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "all" as const, label: "All customers", Icon: Users },
              { v: "admins" as const, label: "Admins", Icon: Shield },
              { v: "user" as const, label: "Specific user", Icon: UserIcon },
            ].map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setAudience(v)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs transition-colors ${
                  audience === v
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {audience === "user" && (
          <div>
            <Label htmlFor="user">Customer</Label>
            <select
              id="user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.email || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="New menu drop ☕"
          />
        </div>

        <div>
          <Label htmlFor="body">Message</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Come try our new seasonal latte, today only."
          />
        </div>

        <div>
          <Label htmlFor="url">Open URL on click</Label>
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/"
          />
        </div>

        <Button onClick={send} disabled={sending || !title.trim()} className="w-full">
          <Send className="size-4 mr-1.5" />
          {sending ? "Sending…" : "Send notification"}
        </Button>
      </div>
    </div>
  );
}
