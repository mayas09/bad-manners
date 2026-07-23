import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const payloadSchema = z.object({
  userId: z.string().uuid().optional(),
  toAdmins: z.boolean().optional(),
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  url: z.string().max(500).optional(),
  tag: z.string().max(80).optional(),
});

/**
 * Send a Web Push notification to a specific user or to all admin users.
 * Callable by any authenticated user for their OWN userId, or by an admin for any user / all admins.
 */
export const sendPushNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => payloadSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Authorization: users can push to themselves; admins can push to anyone / all admins.
    const { data: isAdminRow } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const isAdmin = !!isAdminRow;
    if (!isAdmin) {
      if (data.toAdmins) throw new Error("Forbidden");
      if (data.userId && data.userId !== context.userId) throw new Error("Forbidden");
    }

    const admin = supabaseAdmin as any;

    // Resolve recipient user IDs.
    let userIds: string[] = [];
    if (data.toAdmins) {
      const { data: rows } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      userIds = (rows ?? []).map((r: any) => r.user_id as string);
    } else {
      userIds = [data.userId ?? context.userId];
    }
    if (userIds.length === 0) return { sent: 0 };

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint,subscription_json")
      .in("user_id", userIds);
    if (!subs || subs.length === 0) return { sent: 0 };

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@badmanners.coffee";
    if (!publicKey || !privateKey) {
      console.warn("VAPID keys not configured — skipping push");
      return { sent: 0, error: "VAPID keys not configured" };
    }

    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const notification = JSON.stringify({
      title: data.title,
      body: data.body ?? "",
      url: data.url ?? "/",
      tag: data.tag,
    });

    let sent = 0;
    const deadEndpoints: string[] = [];
    await Promise.all(
      (subs as any[]).map(async (row) => {
        try {
          const sub = JSON.parse(row.subscription_json as string);
          await webpush.sendNotification(sub, notification);
          sent++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            deadEndpoints.push(row.endpoint as string);
          } else {
            console.error("Push send error", err);
          }
        }
      }),
    );

    if (deadEndpoints.length) {
      await admin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    return { sent };
  });
