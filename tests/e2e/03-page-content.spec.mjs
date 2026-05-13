// 03-page-content.spec.mjs — content-checks op publieke pagina's
//
// Verifieert dat publieke pagina's (login.html) en HTTP-responses
// geen kritieke regressies hebben. Voor protected pages testen we
// alleen redirect-gedrag (zie 02-auth-redirect.spec.mjs).
//
// Voor diepere tests van protected pages: authenticate eerst via
// een test-account (auth.users) en gebruik storageState. Niet
// geïmplementeerd in v1-skelet om security-reden (test-credentials
// in repo).

import { test, expect } from "@playwright/test";

test.describe("Publieke content checks", () => {
  test("login.html bevat correcte branding", async ({ page }) => {
    await page.goto("/login.html");
    // Branding moet zichtbaar zijn — ETF / Besa Suite
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/Besa|ETF/i);
  });

  test("login.html script-load-order is correct", async ({ page }) => {
    await page.goto("/login.html");
    const html = await page.content();

    const supabaseCdnIdx = html.indexOf("cdn.jsdelivr.net/npm/@supabase");
    const supabaseClientIdx = html.indexOf("supabase-client.js");

    // CDN moet vóór supabase-client.js komen (werkpatronen sectie 6d)
    if (supabaseCdnIdx > -1 && supabaseClientIdx > -1) {
      expect(supabaseCdnIdx).toBeLessThan(supabaseClientIdx);
    }
  });

  test("css/js statics returneren correcte cache-headers", async ({ page }) => {
    const cssResponse = await page.request.head("/styles.css?v=test");
    const ctype = cssResponse.headers()["content-type"];
    expect(ctype).toContain("text/css");

    const cacheCtrl = cssResponse.headers()["cache-control"];
    // Vercel.json: JS/CSS krijgt 1 jaar immutable
    expect(cacheCtrl).toMatch(/immutable|max-age=31536000/);
  });

  test("vercel.json redirects werken", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    // / → /home.html (307 redirect), maar auth-guard kan vervolgens
    // weer naar login.html sturen
    expect(page.url()).toMatch(/home\.html|login\.html/);
  });
});

test.describe("Geen 404 op kritieke routes", () => {
  // Test alleen routes die zonder auth een 2xx of redirect retourneren
  const routes = [
    "/login.html",
    "/styles.css",
    "/supabase-client.js",
    "/save-feedback.js",
  ];

  for (const route of routes) {
    test(`${route} returneert geen 404`, async ({ page }) => {
      const response = await page.request.head(route);
      expect(response.status()).toBeLessThan(404);
    });
  }
});
