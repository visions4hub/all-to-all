import { defineConfig, devices } from "@playwright/test";

// Browser tests for the PDF tools, run against the static build.
//   npm run build
//   npm run test:e2e:pdf
// PDF_E2E_URL=http://localhost:3000 runs against a dev server instead.
const PORT = 4174;
const external = process.env.PDF_E2E_URL;

export default defineConfig({
  testDir: "e2e/pdf",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  outputDir: "test-results/pdf",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: `node e2e/pdf/static-server.mjs ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 }, browserName: "chromium" } },
  ],
});
