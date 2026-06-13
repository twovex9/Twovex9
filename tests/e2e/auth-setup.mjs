// auth-setup.mjs — Playwright global-setup voor authenticated tests.
// Sprint 11 / v2 master-plan S11.
//
// Doet één login + bewaart storage-state in tests/e2e/.auth/storage.json zodat
// alle authenticated tests die state kunnen hergebruiken (zonder per-test
// opnieuw in te loggen).
//
// Vereist environment variables (lokaal in .env, gitignored):
//   FF_E2E_EMAIL=...     (test-user in Supabase Auth)
//   FF_E2E_PASSWORD=...
//
// Test-user moet bestaan: maak via Supabase dashboard >
// Auth > Users > Add user, OF via Supabase MCP create_user.
// Aanbevolen email: e2e-test@besasolutions.nl met rol "medewerker".
//
// Run:
//   $env:FF_E2E_EMAIL = "..."
//   $env:FF_E2E_PASSWORD = "..."
//   npm run test:e2e:authenticated

import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_PATH = join(__dirname, ".auth", "storage.json");

export default async function globalSetup() {
  const email = process.env.FF_E2E_EMAIL;
  const password = process.env.FF_E2E_PASSWORD;
  const baseUrl = process.env.FF_BASE_URL || "https://futureflow-app.vercel.app";

  if (!email || !password) {
    console.warn(
      "[auth-setup] FF_E2E_EMAIL / FF_E2E_PASSWORD niet gezet — " +
      "authenticated tests slaan over. Zet env-vars om te runnen."
    );
    // Schrijf lege state zodat tests met storageState graceful skippen
    if (!existsSync(dirname(STORAGE_PATH))) mkdirSync(dirname(STORAGE_PATH), { recursive: true });
    writeFileSync(STORAGE_PATH, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    return;
  }

  console.log(`[auth-setup] Login als ${email} op ${baseUrl}...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(`${baseUrl}/login.html`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Wacht tot we op home.html zijn (auth-guard redirect na succesvolle login)
    await page.waitForURL(/home\.html|index\.html/, { timeout: 15000 });

    // Persist storage state
    if (!existsSync(dirname(STORAGE_PATH))) mkdirSync(dirname(STORAGE_PATH), { recursive: true });
    await page.context().storageState({ path: STORAGE_PATH });
    console.log(`[auth-setup] ✅ Sessie opgeslagen in ${STORAGE_PATH}`);
  } catch (err) {
    console.error(`[auth-setup] ❌ Login mislukt: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}
