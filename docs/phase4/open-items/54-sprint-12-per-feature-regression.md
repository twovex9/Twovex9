# Item 54 — Sprint 12: Per-feature regression tests

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S12 in `../v2-master-plan.md`
**Gerelateerd**: items 33 (Betalingen), 34 (Contacten), 35 (Rapportages), 37 (Vragenlijsten), S11 (auth-setup)

## Wat is gedaan

Per-feature regression tests voor de 4 cliënt-detail tabs die in Phase 4 zijn geïmplementeerd. Self-contained (eigen login-fixture i.p.v. dependency op S11's globalSetup) zodat deze sprint onafhankelijk gemerged kan worden.

### Files

- `tests/e2e/05-feat-betalingen.spec.mjs` — 2 tests (tab visible + panel content)
- `tests/e2e/06-feat-contacten.spec.mjs` — 2 tests (tab visible + modal open/close)
- `tests/e2e/07-feat-rapportages.spec.mjs` — 2 tests (tab visible + no pageerrors)
- `tests/e2e/08-feat-vragenlijsten.spec.mjs` — 2 tests (tab visible + panel content)

**Totaal**: 8 nieuwe tests + bestaande 13 (smoke/auth/content) + S11's 7 authenticated = 28 tests in suite.

### Architectuur

**Self-contained login-fixture pattern**:
```js
const test = base.extend({
  authedPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Login flow...
    await use(page);
    await ctx.close();
  },
});
```

Voordeel: geen dependency op `playwright.config.mjs` project-split uit S11. Mergt onafhankelijk; werkt zodra `BESA_E2E_EMAIL` + `BESA_E2E_PASSWORD` env-vars gezet zijn.

**Graceful skip** zoals S11: `test.skip(!HAS_CREDS, ...)` op suite-niveau.

### Test-strategie per tab

1. **Betalingen** — tab visible + panel content (geen "placeholder" tekst)
2. **Contacten** — tab visible + "Contact toevoegen" modal open/close
3. **Rapportages** — tab visible + geen JS-pageerrors bij tab-switch
4. **Vragenlijsten** — tab visible + panel toont geen placeholder

Heuristic-based selectors (`[data-cd-tab="..."]` OR `button:has-text("...")`) zodat tests blijven werken als één van beide naming conventions overleeft.

## Test plan

- [ ] CI groen — alle 28 tests draaien (8 nieuwe skippen graceful zonder creds)
- [ ] Lokaal met `BESA_E2E_EMAIL/PASSWORD`: 8 nieuwe tests pass
- [ ] Geen merge-conflict met PR #35 (S11) — beide editen verschillende files

## User-actie (optioneel — voor lokaal runnen)

```powershell
\$env:BESA_E2E_EMAIL = "e2e-test@besasolutions.nl"
\$env:BESA_E2E_PASSWORD = "..."
npm run test:e2e
```

Geen credentials → 8 tests skippen netjes (geen failures).

## Acceptance (master-plan S12)

- ✅ Regression-tests voor Betalingen/Contacten/Rapportages/Vragenlijsten
- ✅ Self-contained — geen dependency op andere sprints
- ✅ Skip-pattern zoals S11 voor CI-vriendelijkheid

## Status update bij merge

Bij merge: master-plan S12 → ✅ DONE + PR-nummer. Direct start Sprint 13 (CI integratie op release-tag, 1u).
