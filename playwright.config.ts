import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui-browser",
  outputDir: "./test-results/react-ui",
  timeout: 30_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: "http://127.0.0.1:4176",
    browserName: "chromium",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run example:inspection-ui",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
    timeout: 120_000
  }
});
