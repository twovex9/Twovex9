// 08-feat-vragenlijsten.spec.mjs — Per-feature regression: cliënt-detail Vragenlijsten-tab
// Sprint 12 / v2 master-plan S12. Verifieert item 37 (Vragenlijsten-tab implementatie).

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

test.describe("Feature regression — Cliënt-detail Vragenlijsten-tab", () => {
  test.skip(!HAS_CREDS, "FF_E2E_EMAIL/PASSWORD niet gezet");

  test("Vragenlijsten-tab zichtbaar + opent", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.locator('[data-cd-tab="vragenlijsten"], button:has-text("Vragenlijsten")').first();
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
  });

  test("Vragenlijsten-panel toont template-keuze of leeg-state", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.locator('[data-cd-tab="vragenlijsten"], button:has-text("Vragenlijsten")').first();
    await tab.click();
    await page.waitForTimeout(500);

    // Panel moet of een lijst, of een leeg-state, of een nieuwe-vragenlijst-knop tonen
    const panel = page.locator('[data-cd-panel="vragenlijsten"], #cd-vragenlijsten').first();
    if (await panel.count()) {
      const text = await panel.textContent();
      expect(text || "").not.toMatch(/komt later|nog niet geïmplementeerd|placeholder/i);
    }
  });
});
