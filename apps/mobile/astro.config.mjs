import { defineConfig } from "astro/config";

// Static output, no server: the app is a bundle of files the Tauri WebView loads
// from disk. Everything below that is a plain web component, so no UI framework
// integration is needed.
export default defineConfig({
  output: "static",
  outDir: "./dist",
  build: {
    // One CSS file instead of per-page styles — the app is a single page.
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      target: "es2022",
      // Android WebViews of interest all support modern syntax; smaller output.
      cssTarget: "chrome108",
      sourcemap: false,
    },
    // Tauri's dev server needs a fixed port it can point the WebView at.
    server: {
      port: 4321,
      strictPort: true,
    },
  },
});
