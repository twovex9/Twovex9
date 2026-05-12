// playwright.config.mjs — E2E test configuratie voor BS1
//
// Doel: smoke tests + tab-verificaties die regressies vangen
// vóór ze in productie komen.
//
// Gebruik:
//   npm run test:e2e:install   # eerste keer — installeert chromium (~120MB)
//   npm run test:e2e           # runt alle tests headless
//   npm run test:e2e:ui        # interactive mode met test browser
//
// Tests draaien tegen `BESA_BASE_URL` (default: production besa-suite.vercel.app).
// Voor lokaal testen: BESA_BASE_URL=http://localhost:8000 npm run test:e2e

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BESA_BASE_URL || "https://besa-suite.vercel.app";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Geen webServer config — we testen tegen al gedeployde site
  // (Vercel preview of productie). Voor lokaal: start eerst
  // `python -m http.server 8000` of equivalent.
});
