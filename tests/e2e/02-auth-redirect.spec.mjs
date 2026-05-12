// 02-auth-redirect.spec.mjs — auth-guard moet onbeveiligde pagina's beschermen
//
// Verifieert dat zonder sessie:
//  - Beschermde routes redirecten naar /login.html?next=...
//  - login.html zelf is publiek toegankelijk

import { test, expect } from "@playwright/test";

const PROTECTED_PAGES = [
  "/home.html",
  "/index.html",
  "/clienten.html",
  "/beschikkingen.html",
  "/planning.html",
  "/facturen.html",
  "/incidenten.html",
  "/audit.html",
  "/instellingen.html",
];

test.describe("Auth-guard redirects", () => {
  // Maak nieuwe browser-context per test (geen cookies/storage van vorige tests)
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PROTECTED_PAGES) {
    test(`${path} redirect naar login.html zonder sessie`, async ({ page }) => {
      // Vermijd evt. localStorage van vorige test-runs
      await page.context().clearCookies();
      await page.goto("about:blank");
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      });

      // Navigate naar protected page
      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Auth-guard.js doet client-side redirect naar login.html?next=<huidige>
      // Dat is een JS-redirect, kan even duren. Wacht op URL-change.
      await page.waitForURL(/login\.html/, { timeout: 5000 }).catch(() => {});

      // Verifieer eind-URL bevat login.html
      expect(page.url()).toContain("login.html");

      // En de `next` query-param zou de oorspronkelijke pagina moeten bevatten
      const url = new URL(page.url());
      const next = url.searchParams.get("next");
      if (next) {
        expect(decodeURIComponent(next)).toContain(path);
      }
    });
  }

  test("login.html zelf is publiek toegankelijk (geen redirect-loop)", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login.html");
    expect(page.url()).toContain("login.html");
    // Pagina mag NIET naar zichzelf redirecten — dat zou loop zijn
    await page.waitForTimeout(2000); // 2s laten staan
    expect(page.url()).toContain("login.html");
    // Login-form moet zichtbaar zijn
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
