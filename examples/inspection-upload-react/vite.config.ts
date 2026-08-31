import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      { find: "large-image-ingest/browser", replacement: fileURLToPath(new URL("../../src/browser.ts", import.meta.url)) },
      { find: "large-image-ingest/react-ui/styles.css", replacement: fileURLToPath(new URL("../../styles/react-ui.css", import.meta.url)) },
      { find: "large-image-ingest/react-ui", replacement: fileURLToPath(new URL("../../src/react-ui.ts", import.meta.url)) },
      { find: "large-image-ingest/react", replacement: fileURLToPath(new URL("../../src/react.ts", import.meta.url)) },
      { find: "large-image-ingest/core", replacement: fileURLToPath(new URL("../../src/core.ts", import.meta.url)) }
    ]
  },
  server: {
    host: "127.0.0.1",
    port: 4176,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:4177", changeOrigin: false } }
  },
  build: { outDir: ".vite-dist", emptyOutDir: true }
});
