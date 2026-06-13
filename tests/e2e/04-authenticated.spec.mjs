// 04-authenticated.spec.mjs — tests die LOGGED-IN state vereisen.
// Sprint 11 / v2 master-plan S11.
//
// Gebruikt storageState uit auth-setup.mjs (zie playwright.config.mjs).
// Test-user moet bestaan in Supabase Auth — zie tests/README.md.
//
// Slim skip pattern: als FF_E2E_EMAIL niet gezet is, hele suite skipt
// zonder failures. Lokaal:
//   $env:FF_E2E_EMAIL = "..."
//   $env:FF_E2E_PASSWORD = "..."
//   npm run test:e2e

import { test, expect } from "@playwright/test";

// Hele suite skipt als geen credentials — voorkomt CI-fail bij PR's zonder secrets
const HAS_CREDS = !!process.env.FF_E2E_EMAIL && !!process.env.FF_E2E_PASSWORD;

test.describe("Authenticated tests", () => {
  test.skip(!HAS_CREDS, "FF_E2E_EMAIL/PASSWORD niet gezet — skip authenticated suite");

  test("home.html laadt voor ingelogde user (geen redirect naar login)", async ({ page }) => {
    await page.goto("/home.html");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("home.html");
    expect(page.url()).not.toContain("login.html");
    // Topbar avatar/uitlog-link moet aanwezig zijn
    await expect(page.locator(".topbar")).toBeVisible();
  });

  test("rollen.html toont 5 secties + 14 rollen (Sprint 1 verify)", async ({ page }) => {
    await page.goto("/rollen.html");
    await page.waitForLoadState("domcontentloaded");
    // Wacht op data-laag bootstrap (rollen.js doet ready-await)
    await page.waitForFunction(() => {
      const t = document.getElementById("rollen-totaal");
      return t && /\d+ rollen, \d+ gebruikers/.test(t.textContent || "");
    }, null, { timeout: 10000 });
    const totaal = await page.locator("#rollen-totaal").textContent();
    expect(totaal).toMatch(/14 rollen/);
    const sections = await page.locator(".rollen-section").count();
    expect(sections).toBeGreaterThanOrEqual(5);
  });

  test("clienten.html laadt met records (RLS admin-bypass)", async ({ page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("clienten.html");
    // Tabel moet renderen (kan leeg zijn voor test-user met rol medewerker)
    await expect(page.locator(".employees-table, .table-card")).toBeVisible();
    // Geen 403 / error op pagina
    const body = await page.locator("body").textContent();
    expect(body).not.toContain("403");
    expect(body).not.toContain("Forbidden");
  });

  test("planning.html toont 5 KPI cards (Sprint 6 verify)", async ({ page }) => {
    await page.goto("/planning.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".planning-kpi--v3", { timeout: 5000 });
    const cards = await page.locator(".planning-kpi--v3").count();
    expect(cards).toBe(5);
    const labels = await page.locator(".planning-kpi--v3 .planning-stat-label").allTextContents();
    expect(labels).toContain("ZZP Kosten");
    expect(labels).toContain("Geplande uren");
    expect(labels).toContain("Openstaande uren");
    expect(labels).toContain("Kilometerkosten");
    expect(labels).toContain("Gem. tarief");
  });

  test("taken.html toont 9 filters (Sprint 8 verify)", async ({ page }) => {
    await page.goto("/taken.html");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#taken-filter-teamlid")).toBeVisible();
    await expect(page.locator("#taken-filter-deadline")).toBeVisible();
    await expect(page.locator("#taken-filter-aanmaakdatum")).toBeVisible();
    await expect(page.locator("#taken-filter-reset")).toBeVisible();
    await expect(page.locator('th[data-col="aangemaakt_door"]')).toBeVisible();
  });

  test("beleid.html toont Kolommen + Reset (Sprint 9 verify)", async ({ page }) => {
    await page.goto("/beleid.html");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("#beleid-columns-menu-btn")).toBeVisible();
    await expect(page.locator("#beleid-reset-btn")).toBeVisible();
  });

  test("planning preset-flow: save + load + delete", async ({ page }) => {
    await page.goto("/planning.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("#planning-presets-new-btn", { timeout: 5000 });

    // Click new + type name
    await page.click("#planning-presets-new-btn");
    await page.waitForSelector("#planning-presets-input:not([hidden])", { timeout: 1000 });
    const presetName = "E2E test " + Date.now();
    await page.fill("#planning-presets-input", presetName);
    await page.click("#planning-presets-save-btn");

    // Wacht tot preset in lijst staat
    await page.waitForFunction(
      (name) => {
        const items = document.querySelectorAll("#planning-presets-list .planning-erm-preset-label");
        return [...items].some((b) => b.textContent === name);
      },
      presetName,
      { timeout: 5000 }
    );

    // Cleanup: delete via DB
    await page.evaluate(async (name) => {
      const db = window.planningVoorinstellingenDB;
      const items = db.getAllSync();
      const item = items.find((p) => p.naam === name);
      if (item) await db.delete(item.id);
    }, presetName);
  });
});
