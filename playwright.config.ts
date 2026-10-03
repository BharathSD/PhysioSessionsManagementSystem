import { defineConfig, devices } from "@playwright/test";

// Browser tests against the real app and a Supabase project (see README → Testing).
// By default this builds and starts the app on port 3100. Set E2E_BASE_URL to
// test a server that's already running instead.
const port = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // tests share one app server; each file uses its own test account
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        // Use an already-installed Chromium if given (otherwise: npx playwright install chromium).
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${port}`,
        url: `http://localhost:${port}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 600_000,
      },
});
