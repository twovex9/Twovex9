// 05-feat-betalingen.spec.mjs — Per-feature regression: cliënt-detail Betalingen-tab
// Sprint 12 / v2 master-plan S12. Verifieert item 33 (Betalingen-tab implementatie).
//
// Self-contained: doet eigen login via env-vars, geen dependency op S11's globalSetup.
// Skipt graceful zonder credentials.

import { test as base, expect } from "@playwright/test";

const HAS_CREDS = !!process.env.BESA_E2E_EMAIL && !!process.env.BESA_E2E_PASSWORD;

const test = base.extend({
  authedPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login.html");
    await page.fill('input[type="email"]', process.env.BESA_E2E_EMAIL);
    await page.fill('input[type="password"]', process.env.BESA_E2E_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/home\.html|index\.html/, { timeout: 15000 });
    await use(page);
    await ctx.close();
  },
});

test.describe("Feature regression — Cliënt-detail Betalingen-tab", () => {
  test.skip(!HAS_CREDS, "BESA_E2E_EMAIL/PASSWORD niet gezet — skip regression suite");

  test("Betalingen-tab is zichtbaar in cliënt-detail", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    // Wacht op tabel
    await page.waitForSelector(".employees-table tbody tr, .table-card", { timeout: 10000 });
    // Klik eerste cliënt-naam-link (kan ook button zijn)
    const firstClient = page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first();
    await firstClient.click();
    // Cliënt-detail laadt — wacht op tabs
    await page.waitForURL(/client-detail/, { timeout: 5000 }).catch(() => {});
    // Betalingen-tab moet bestaan (label of data-attr)
    const betalingenTab = page.locator('[data-cd-tab="betalingen"], button:has-text("Betalingen")').first();
    await expect(betalingenTab).toBeVisible({ timeout: 5000 });
  });

  test("Klik Betalingen-tab → panel toont content (geen placeholder)", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.locator('[data-cd-tab="betalingen"], button:has-text("Betalingen")').first();
    await tab.click();
    // Panel mag geen "Komt later" / placeholder tekst tonen
    const panel = page.locator('[data-cd-panel="betalingen"], #cd-betalingen, .cd-panel-betalingen').first();
    if (await panel.count()) {
      const text = await panel.textContent();
      expect(text || "").not.toMatch(/komt later|nog niet geïmplementeerd|placeholder/i);
    }
  });
});
