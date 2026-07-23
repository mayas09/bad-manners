import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/lib/use-customer-auth";
import {
  getPushStatus,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

type Notification = {
  id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  order_id: string | null;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export function NotificationBell() {
  const auth = useCustomerAuth();
  const nav = useNavigate();
  const userId = auth.user?.id;
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const status = await getPushStatus();
      setPushEnabled(status === "granted");
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    const uid = userId;
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("id,message,is_read,created_at,order_id")
          .eq("customer_id", uid)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        if (cancelled) return;
        const list = (data as Notification[]) ?? [];
        setItems(list);
        setUnreadCount(list.filter((n) => !n.is_read).length);
      } catch (err) {
        console.error("Failed to load notifications", err);
      }
    }
    load();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `customer_id=eq.${uid}`,
          },
          (payload) => {
            const row = payload.new as Notification;
            setItems((prev) => [row, ...prev].slice(0, 20));
            setUnreadCount((c) => c + 1);
            toast(row.message);
          },
        )
        .subscribe();
    } catch (err) {
      console.error("Failed to subscribe to notifications channel", err);
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0 && userId) {
      setUnreadCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      try {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("customer_id", userId)
          .eq("is_read", false);
      } catch (err) {
        console.error("Failed to mark notifications as read", err);
      }
    }
  }

  function handleSelect(n: Notification) {
    setOpen(false);
    if (n.order_id) {
      nav({ to: "/account/receipt/$orderId", params: { orderId: n.order_id } });
    } else {
      nav({ to: "/account/events" });
    }
  }

  async function togglePush() {
    if (!userId) return;
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        toast("Push notifications turned off");
      } else {
        const ok = await subscribeToPush(userId);
        if (ok) {
          setPushEnabled(true);
          toast.success("Push notifications enabled");
        } else {
          toast.error("Could not enable push notifications");
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

  if (auth.loading || !auth.user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex size-9 items-center justify-center rounded-full hover:bg-slate-100"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-[--pink-deep] text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[--pink]/20 bg-white shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {isPushSupported() && (
              <button
                type="button"
                onClick={togglePush}
                disabled={pushBusy}
                className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                title={pushEnabled ? "Turn off push notifications" : "Enable push notifications"}
              >
                {pushEnabled ? <BellRing className="size-3" /> : <BellOff className="size-3" />}
                {pushEnabled ? "On" : "Off"}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
                <Bell className="size-6 text-slate-300" />
                <p className="text-sm text-muted-foreground">No new notifications</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelect(n)}
                  className="w-full text-left px-3 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <p className="text-sm text-slate-800">{n.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
