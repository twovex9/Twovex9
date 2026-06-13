// 06-feat-contacten.spec.mjs — Per-feature regression: cliënt-detail Contacten-tab
// Sprint 12 / v2 master-plan S12. Verifieert item 34 (Contacten-tab implementatie).

import { test as base, expect } from "@playwright/test";

const HAS_CREDS = !!process.env.FF_E2E_EMAIL && !!process.env.FF_E2E_PASSWORD;

const test = base.extend({
  authedPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login.html");
    await page.fill('input[type="email"]', process.env.FF_E2E_EMAIL);
    await page.fill('input[type="password"]', process.env.FF_E2E_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/home\.html|index\.html/, { timeout: 15000 });
    await use(page);
    await ctx.close();
  },
});

test.describe("Feature regression — Cliënt-detail Contacten-tab", () => {
  test.skip(!HAS_CREDS, "FF_E2E_EMAIL/PASSWORD niet gezet");

  test("Contacten-tab zichtbaar + opent", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.locator('[data-cd-tab="contacten"], button:has-text("Contacten")').first();
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
  });

  test("Contacten-panel kan modal openen", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.locator('[data-cd-tab="contacten"], button:has-text("Contacten")').first();
    await tab.click();
    // Zoek toevoegen-knop
    const addBtn = page.locator('button:has-text("Contact toevoegen"), button:has-text("+ Contact"), [id*="contact"][id*="add"]').first();
    if (await addBtn.count()) {
      await addBtn.click();
      // Modal-overlay verschijnt
      const modal = page.locator(".modal-overlay, .emp-verzuim-modal-overlay").first();
      await expect(modal).toBeVisible({ timeout: 3000 });
      // Sluit
      const cancel = page.locator('button:has-text("Annuleren")').first();
      if (await cancel.count()) await cancel.click();
    }
  });
});
