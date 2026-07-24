import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side hCaptcha token verification.
 * Requires HCAPTCHA_SECRET env var (server-only).
 * Returns { success: true } on valid token, throws on invalid/misconfigured.
 */
export const verifyHcaptcha = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ token: z.string().min(1, "Captcha token required") }).parse(data),
  )
  .handler(async ({ data }) => {
    const secret = process.env.HCAPTCHA_SECRET;
    if (!secret) {
      throw new Error("Server misconfiguration: HCAPTCHA_SECRET is not set.");
    }
    const body = new URLSearchParams({ secret, response: data.token });
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!json.success) {
      throw new Error(
        `Captcha verification failed${
          json["error-codes"]?.length ? `: ${json["error-codes"].join(", ")}` : ""
        }`,
      );
    }
    return { success: true as const };
  });
