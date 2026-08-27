// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

const browserAsyncHooksPlugin: Plugin = {
  name: "dk-browser-async-hooks-polyfill",
  enforce: "pre",
  resolveId(source, _importer, options) {
    if (source === "node:async_hooks" && !options.ssr) {
      return "\0dk-browser-async-hooks";
    }
    return undefined;
  },
  load(id) {
    if (id === "\0dk-browser-async-hooks") {
      return `export { AsyncLocalStorage } from "/src/lib/async-hooks-browser.ts";`;
    }
    return undefined;
  },
};

export default defineConfig({
  plugins: [browserAsyncHooksPlugin],
  vite: {
    optimizeDeps: {
      exclude: [
        "@tanstack/react-start-client",
        "@tanstack/start-client-core",
        "@tanstack/start-storage-context",
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
