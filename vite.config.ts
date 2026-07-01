// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // noExternals: bundle all server deps instead of externalizing + nf3-tracing them.
  // The installed nf3/@vercel/nft build fails at build time trying to import a named
  // export from a CJS module, which only happens on the externals-tracing code path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- noExternals isn't in the narrow LovableViteTanstackOptions surface yet, but is forwarded through to nitro() at runtime
  nitro: { noExternals: true } as any,
});
