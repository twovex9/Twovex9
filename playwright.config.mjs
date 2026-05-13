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
const HAS_E2E_CREDS = !!process.env.BESA_E2E_EMAIL && !!process.env.BESA_E2E_PASSWORD;

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
  // Sprint 11 / S11 — global-setup voor authenticated tests
  // Schrijft tests/e2e/.auth/storage.json met sessie-cookies.
  // Skipt graceful als BESA_E2E_EMAIL niet gezet is.
  globalSetup: "./tests/e2e/auth-setup.mjs",
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
      // Unauthenticated tests (geen storageState) — smoke, auth-redirect, content
      name: "chromium-unauth",
      testMatch: /(01-smoke|02-auth-redirect|03-page-content)\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      // Authenticated tests — herbruiken sessie uit auth-setup
      name: "chromium-auth",
      testMatch: /04-authenticated\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: HAS_E2E_CREDS ? "./tests/e2e/.auth/storage.json" : undefined,
      },
    },
  ],
  // Geen webServer config — we testen tegen al gedeployde site
  // (Vercel preview of productie). Voor lokaal: start eerst
  // `python -m http.server 8000` of equivalent.
});
