// 07-feat-rapportages.spec.mjs — Per-feature regression: cliënt-detail Rapportages-tab
// Sprint 12 / v2 master-plan S12. Verifieert item 35 (Rapportages-tab implementatie).

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

test.describe("Feature regression — Cliënt-detail Rapportages-tab", () => {
  test.skip(!HAS_CREDS, "BESA_E2E_EMAIL/PASSWORD niet gezet");

  test("Rapportages-tab zichtbaar + opent", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const tab = page.locator('[data-cd-tab="rapportages"], button:has-text("Rapportages")').first();
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
  });

  test("Rapportages-panel render zonder fouten", async ({ authedPage: page }) => {
    await page.goto("/clienten.html");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".employees-table tbody tr", { timeout: 10000 });
    await page.locator(".employees-table tbody tr").first().locator("a, button.link-button").first().click();
    await page.waitForLoadState("domcontentloaded");

    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const tab = page.locator('[data-cd-tab="rapportages"], button:has-text("Rapportages")').first();
    await tab.click();
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});
