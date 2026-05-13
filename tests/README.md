# BS1 — E2E test-suite

Playwright-based browser tests die regressies vangen vóór ze in productie komen.

## Wat zit hier

- `e2e/01-smoke.spec.mjs` — kritieke pagina's responden, cache-busting actief, headers correct
- `e2e/02-auth-redirect.spec.mjs` — alle 9 protected pages redirecten naar login zonder sessie
- `e2e/03-page-content.spec.mjs` — publieke content + script-load-order + redirects

**Niet getest in v1**: protected pages content zelf. Dat vereist een test-account met test-credentials in repo (security-risico). Voor v2 — zie sectie "Uitbreidingen".

## Eerste keer setup (~3 min)

```powershell
cd "C:\Users\sonck\OneDrive\Desktop\ETF\besa suite git clone\besa-suite-etf"
npm install                  # installeert @playwright/test (~50MB)
npm run test:e2e:install     # downloadt chromium (~120MB)
```

## Tests runnen

```powershell
npm run test:e2e             # alle tests, headless
npm run test:e2e:ui          # interactive mode met browser-UI
```

Default test-target is **productie** (`https://besa-suite.vercel.app`).

Voor lokaal testen:

```powershell
# Start lokale server (in aparte terminal):
python -m http.server 8000

# Run tests tegen lokaal:
$env:BESA_BASE_URL = "http://localhost:8000"
npm run test:e2e
```

## Tests tegen Vercel preview

Bij elke PR krijg je een Vercel preview URL. Test daartegen:

```powershell
$env:BESA_BASE_URL = "https://besa-suite-PREVIEW-xxx.vercel.app"
npm run test:e2e
```

⚠️ Vercel preview deploys zijn SSO-protected — tests die HTTP-headers vereisen werken wél, maar pagina-content krijgen geen 200.

## CI integratie

E2E tests draaien (nog) **niet** automatisch op CI. Reden:
- Vercel preview deploys zijn SSO-protected
- Chromium install voegt ~120MB toe aan elke CI run
- Tests duren ~30s per browser

Voor v2: gh actions workflow die `npm run test:e2e` runt tegen production op release-tag.

## Uitbreidingen (v2 / voor toekomstige Claude)

### Authenticated tests

Voor diepere tests van protected pages (medewerker-CRUD, cliënt-detail tabs, etc.):

1. Maak test-user in Supabase Auth: `e2e-test@besasolutions.nl` met rol `medewerker`
2. Sla credentials op in CI secret + lokaal `.env` (gitignored)
3. Schrijf `tests/e2e/auth-setup.mjs` global-setup script:
   ```js
   import { chromium } from "@playwright/test";
   const browser = await chromium.launch();
   const page = await browser.newPage();
   await page.goto("/login.html");
   await page.fill('input[type="email"]', process.env.E2E_EMAIL);
   await page.fill('input[type="password"]', process.env.E2E_PASSWORD);
   await page.click('button[type="submit"]');
   await page.waitForURL("**/home.html");
   await page.context().storageState({ path: "tests/e2e/.auth/storage.json" });
   ```
4. Update `playwright.config.mjs` met `globalSetup` + per-project `storageState`
5. Schrijf authenticated tests die deze state hergebruiken

### Per-feature regression tests

Voor elk groot feature toevoegen:

- `tests/e2e/feat-betalingen-tab.spec.mjs` — open cliënt, klik Betalingen, verifieer tabel
- `tests/e2e/feat-contacten-tab.spec.mjs` — add/edit/archive contact via modal
- `tests/e2e/feat-rapportages-tab.spec.mjs` — upload bijlage, verifieer download
- `tests/e2e/feat-vragenlijsten-tab.spec.mjs` — template laden, vragen toevoegen
- `tests/e2e/feat-planning-shifts.spec.mjs` — week-navigatie, shift-detail

### Visual regression

Playwright kan screenshots vergelijken — `await expect(page).toHaveScreenshot()`.
Storage: `tests/e2e/__screenshots__/`. Eerste run = baseline, daarna fail bij verschillen.

Trade-off: baselines moeten bij bewuste UI-wijzigingen worden bijgewerkt — niet
"set-and-forget".

## Status item 6.3

✅ **Skelet aanwezig** — Playwright config + 13 tests verspreid over 3 files (smoke + auth + content).
⏳ **Authenticated tests**: voor v2.
⏳ **CI integratie**: voor v2 op release-tag basis.
