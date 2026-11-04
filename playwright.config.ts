import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the static build: `npm run build`, then `npm run test:e2e`.
// E2E_PORT lets parallel checkouts use different ports.
// Projects: Chromium (desktop + mobile) for daily runs (`npm run test:e2e`);
// Firefox, desktop Safari (WebKit) and iPhone Safari (WebKit, touch) are added
// for the full cross-browser run (`npm run test:e2e:all`).
const port = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    { name: "firefox-desktop", use: { ...devices["Desktop Firefox"], viewport: { width: 1366, height: 900 } } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"], viewport: { width: 1366, height: 900 } } },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `node e2e/serve.mjs ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
