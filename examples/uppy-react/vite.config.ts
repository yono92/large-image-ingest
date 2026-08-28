import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: ".vite-dist",
    emptyOutDir: true
  }
});
