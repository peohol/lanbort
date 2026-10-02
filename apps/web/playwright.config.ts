import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

// End-to-end tests run against the production build (`pnpm build` first), so
// they exercise the same security headers and CSP that are deployed.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    // Browsers send Origin on POST; API-level tests do the same, so the
    // route boundary's same-origin check sees what a real browser sends.
    extraHTTPHeaders: { origin: baseURL },
    trace: "retain-on-failure",
    // Lets a machine with a preinstalled Chromium run the tests; CI installs
    // the browser matching the Playwright version instead.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          },
        }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `next start --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
