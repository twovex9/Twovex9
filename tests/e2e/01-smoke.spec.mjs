// 01-smoke.spec.mjs — basis smoke tests
//
// Verifieert dat de app überhaupt draait: kritieke routes responden,
// HTML valide is, geen 500-errors.

import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("root redirects naar /home.html", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response).toBeTruthy();
    // Vercel.json redirect /: → /home.html (status 307 non-permanent)
    // Page volgt redirect; eindigt op /home.html of login.html (als niet ingelogd)
    expect(page.url()).toMatch(/home\.html|login\.html/);
  });

  test("login.html laadt zonder errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto("/login.html");
    expect(response?.status()).toBeLessThan(400);

    // Wacht tot DOM stabiel is
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Verifieer titel + login-elementen
    await expect(page).toHaveTitle(/Inloggen|Login|Besa/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Geen JS-errors tijdens load
    expect(errors).toEqual([]);
  });

  test("cache-busting actief: HTML referenceert versioned assets", async ({ page }) => {
    await page.goto("/login.html");
    const html = await page.content();
    // Bust-cache script voegt ?v=<sha> toe aan local script/link tags
    // Externe CDN's blijven onveranderd
    expect(html).toMatch(/(href|src)="[^"]+\.(css|js)\?v=[a-f0-9]{7,}"/);
  });

  test("HTML cache headers: no-cache", async ({ page }) => {
    const response = await page.goto("/login.html");
    const cacheControl = response?.headers()["cache-control"];
    // Vercel.json zet no-cache, must-revalidate op HTML
    expect(cacheControl).toContain("no-cache");
  });

  test("preconnect hints aanwezig in <head>", async ({ page }) => {
    await page.goto("/login.html");
    const supabasePreconnect = await page
      .locator('link[rel="preconnect"][href*="supabase"]')
      .count();
    expect(supabasePreconnect).toBeGreaterThan(0);
  });
});
