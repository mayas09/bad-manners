import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import {
  getPushStatus,
  isPushSupported,
  subscribeToPush,
} from "@/lib/push-client";

const DISMISS_KEY = "bm_push_dismissed";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  );
}

/**
 * Prompts the signed-in customer to enable push notifications so they get
 * order-status pushes even when the site is closed. Renders nothing when
 * push is already enabled, unsupported, or the user dismissed the banner.
 */
export function PushOptInBanner({ userId }: { userId: string }) {
  const [status, setStatus] = useState<
    "granted" | "denied" | "default" | "unsupported" | "loading"
  >("loading");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    (async () => setStatus(await getPushStatus()))();
  }, [userId]);

  if (status === "loading" || status === "granted") return null;
  if (dismissed && status !== "denied") return null;

  const iosNoPwa = isIos() && !isStandalone();

  async function enable() {
    setBusy(true);
    try {
      const ok = await subscribeToPush(userId);
      if (ok) {
        setStatus("granted");
        toast.success("Push notifications enabled");
      } else {
        toast.error("Could not enable push notifications");
        setStatus(await getPushStatus());
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (status === "unsupported" && !iosNoPwa) return null;

  return (
    <div className="relative flex items-start gap-3 rounded-2xl border border-[--pink]/30 bg-[--pink]/5 p-4">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[--pink-deep] text-white">
        <Bell className="size-4" />
      </div>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-slate-900">
          Get notified when your order is ready
        </p>
        {iosNoPwa ? (
          <p className="mt-1 text-slate-600">
            On iPhone, tap the Share button in Safari and choose
            <span className="font-medium"> “Add to Home Screen”</span>, then
            open the app from your home screen to enable push notifications.
          </p>
        ) : status === "denied" ? (
          <p className="mt-1 text-slate-600">
            Notifications are blocked. Enable them in your browser settings
            for this site to receive order updates.
          </p>
        ) : (
          <>
            <p className="mt-1 text-slate-600">
              Turn on push notifications so we can alert you the moment your
              order is confirmed, ready for pickup, or updated — even when
              the site is closed.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="rounded-full bg-[--pink-deep] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Enabling…" : "Enable notifications"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full border border-slate-300 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 text-slate-400 hover:text-slate-700"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
