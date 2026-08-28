import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "large-image-ingest/core",
        replacement: fileURLToPath(new URL("./src/core.ts", import.meta.url))
      },
      {
        find: "large-image-ingest/react",
        replacement: fileURLToPath(new URL("./src/react.ts", import.meta.url))
      }
    ]
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "tests/ui-browser/**"]
  }
});
