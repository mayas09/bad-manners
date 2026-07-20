/**
 * Fail-fast environment variable helper for server functions and routes.
 *
 * On Cloudflare Workers / Vercel Edge, `process.env` is populated per-request
 * (not at cold start), so we validate on first call inside a handler rather
 * than at module load. Throws a single error listing ALL missing vars, so
 * one deploy misconfiguration surfaces every gap at once instead of failing
 * at the next unrelated code path.
 */
export function requireEnv<K extends string>(keys: readonly K[]): Record<K, string> {
  const missing: string[] = [];
  const out = {} as Record<K, string>;
  for (const k of keys) {
    const v = process.env[k];
    if (!v || v.trim() === "") missing.push(k);
    else out[k] = v;
  }
  if (missing.length > 0) {
    throw new Error(
      `Server misconfiguration: missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them in the hosting platform's environment settings and redeploy.`,
    );
  }
  return out;
}
