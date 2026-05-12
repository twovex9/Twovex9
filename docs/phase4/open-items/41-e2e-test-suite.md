# Item 41 — E2E test-suite skelet (item 6.3 / professional-finish)

**Datum**: 2026-05-13
**Status**: ✅ Skelet voltooid — Playwright config + 13 tests in 3 spec-files
**Gerelateerd**: items 6.3 uit `../06-professional-finish.md`, item 4.3 (CI workflow)

## Wat is gedaan

Playwright-based E2E test-suite skelet. Vangt regressies in pre-merge of pre-release verificaties zonder dat een mens handmatig hoeft te klikken.

### Geïnstalleerd

- `@playwright/test` als devDependency in `package.json`
- `playwright.config.mjs` in repo-root
- `tests/e2e/` directory met 3 spec-files
- `tests/README.md` met setup + usage + uitbreidings-handleiding
- `.gitignore` aangevuld met `playwright-report/`, `test-results/`, `playwright/.cache/`

### Test-coverage v1

**`01-smoke.spec.mjs`** (5 tests):
- `/` redirect naar home.html (of login.html als niet ingelogd)
- login.html laadt zonder JS-errors + bevat email+password inputs
- HTML bevat `?v=<sha>` versioned assets (cache-busting actief)
- HTML response heeft `Cache-Control: no-cache` (vercel.json header)
- Preconnect-hints aanwezig in `<head>` voor Supabase

**`02-auth-redirect.spec.mjs`** (10 tests):
- 9 protected pages (`home`, `index`, `clienten`, `beschikkingen`, `planning`, `facturen`, `incidenten`, `audit`, `instellingen`) redirecten naar `/login.html?next=<huidige>` zonder sessie
- `login.html` zelf veroorzaakt geen redirect-loop

**`03-page-content.spec.mjs`** (7 tests):
- login.html toont Besa/ETF branding
- Script-load-order correct (CDN vóór supabase-client.js)
- CSS-statics responden met `Cache-Control: immutable, max-age=31536000`
- vercel.json `/` → `/home.html` redirect werkt
- 4 kritieke routes returneren geen 404

**Totaal: 22 tests**, alle headless tegen `BESA_BASE_URL` (default productie).

## Wat NIET in v1 zit (bewust)

- **Authenticated tests** — vereist test-credentials in repo (security-risico). Uitbreiding gedocumenteerd in `tests/README.md` voor v2.
- **CI integratie** — Vercel preview deploys zijn SSO-protected; CI-tests zouden alleen tegen productie werken. Voor v2 op release-tag.
- **Visual regression screenshots** — baselines moeten manueel gemanaged. Voor v2 als UI stabiel is.

## Gebruik

```powershell
cd besa-suite-etf
npm install                     # installeert Playwright
npm run test:e2e:install        # downloadt chromium (~120MB, eenmalig)
npm run test:e2e                # runt alle 22 tests (~1 min)
npm run test:e2e:ui             # interactive mode met browser-UI
```

Default target = productie (`https://besa-suite.vercel.app`).
Voor lokaal: `$env:BESA_BASE_URL = "http://localhost:8000"` voordat je runt.

## Effort voor v2 uitbreidingen

| Uitbreiding | Effort | Waarde |
|---|---|---|
| Authenticated test-flow met test-user | 2u | hoog (test echte CRUD) |
| Per-feature regression tests (Betalingen/Contacten/Rapportages/Vragenlijsten) | 4u | hoog |
| Visual regression baselines | 2u | medium |
| CI integratie op release-tag | 1u | medium |
| **Total v2** | **~9u** | |

## Status v1

✅ Skelet werkt. Cliënt kan smoke + auth-redirect testen al draaien tegen productie of preview. Toekomstige features krijgen gemakkelijk hun eigen `tests/e2e/feat-*.spec.mjs` file.

Item 6.3 uit professional-finish **gesloten**.
