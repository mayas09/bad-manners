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
  vite: {
    resolve: {
      alias: {
        // Radix UI's dependency chain (react-remove-scroll, use-sidecar, aria-hidden, ...)
        // imports tslib's helpers (__extends, __assign, __rest, __spreadArray, ...) via the
        // bare "tslib" specifier. That resolves to tslib's `modules/index.js`, which itself
        // destructures those helpers off a default import of tslib's CJS/UMD build — a build
        // whose exports are assigned dynamically inside a factory callback rather than as
        // static `exports.x = ...` statements. Bundler static analysis can't see those
        // exports, so the synthetic interop it generates for that default import resolves to
        // undefined at runtime, crashing SSR with
        // "TypeError: Cannot destructure property '__extends' of ... as it is undefined".
        // Pointing every "tslib" import straight at tslib's real ESM build (plain `export
        // function __extends() {}` statements, no CJS interop involved) removes the ambiguity
        // for every consumer at once.
        tslib: "tslib/tslib.es6.mjs",
      },
    },
  },
});
