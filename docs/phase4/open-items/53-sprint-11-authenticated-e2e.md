# Item 53 — Sprint 11: Authenticated E2E tests

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S11 in `../v2-master-plan.md`
**Gerelateerd**: item 41 (E2E skelet vorige sessie)

## Wat is gedaan

V1 had Playwright skelet met 13 unauthenticated tests (smoke + auth-redirect + public content). V2 voegt **authenticated** tests toe die regressie vangen in protected pages.

### Architectuur

**Global-setup pattern**:
1. `playwright.config.mjs` start `auth-setup.mjs` éénmaal vóór alle tests
2. Auth-setup logt in via `BESA_E2E_EMAIL` + `BESA_E2E_PASSWORD` env-vars
3. Sessie wordt bewaard in `tests/e2e/.auth/storage.json` (gitignored)
4. Authenticated test-project laadt deze state per test — geen herhaalde logins

**Project splitting**:
- `chromium-unauth` — runt 01/02/03-spec (publieke + auth-redirect)
- `chromium-auth` — runt 04-spec (alleen met sessie)

**Graceful skip** als geen credentials:
- `auth-setup.mjs` schrijft lege storage + warning bij ontbrekende env-vars
- `04-authenticated.spec.mjs` heeft `test.skip(!HAS_CREDS, ...)` op suite-level

→ CI zonder secrets faalt NIET, suite skipt netjes.

### Tests in `04-authenticated.spec.mjs`

7 tests die de sprint-acceptance criteria valideren:

1. **home.html laadt voor ingelogde user** — geen redirect naar login
2. **rollen.html toont 5 secties + 14 rollen** (Sprint 1 verify)
3. **clienten.html laadt met records** (RLS admin-bypass)
4. **planning.html toont 5 KPI cards** (Sprint 6 verify — ZZP/Geplande/Openstaande/KM/Tarief)
5. **taken.html toont 9 filters** (Sprint 8 verify — Teamlid + Deadline + Aanmaakdatum + Reset + Aangemaakt door)
6. **beleid.html toont Kolommen + Reset** (Sprint 9 verify)
7. **Planning preset round-trip** (Sprint 4 verify — save + appear in list + cleanup)

### Files

- `tests/e2e/auth-setup.mjs` — global-setup login (nieuw)
- `tests/e2e/04-authenticated.spec.mjs` — 7 authenticated tests (nieuw)
- `playwright.config.mjs` — projects split + globalSetup
- `.gitignore` — `tests/e2e/.auth/` toegevoegd

## User-actie (optioneel — voor lokaal runnen)

Test-user opzetten (eenmalig):

1. Open Supabase dashboard → Auth → Users
2. **Add user** met email zoals `e2e-test@besasolutions.nl` + sterk wachtwoord
3. Confirm via "Auto Confirm User" toggle
4. Optional: profile rol = "medewerker" (geen admin nodig)

Run lokaal:

```powershell
cd "C:\Users\sonck\OneDrive\Desktop\ETF\besa suite git clone\besa-suite-etf"
$env:BESA_E2E_EMAIL = "e2e-test@besasolutions.nl"
$env:BESA_E2E_PASSWORD = "PLAK_WACHTWOORD_HIER"
npm run test:e2e
```

Geen credentials → de 7 authenticated tests skippen netjes met message.

## Test plan (PR-merge)

- [ ] CI groen — unauthenticated tests draaien onveranderd
- [ ] Auth-suite skipt graceful zonder credentials (geen failures)
- [ ] Lokaal met env-vars: alle 7 auth-tests pass

## Acceptance (master-plan S11)

- ✅ Global-setup script voor login (mirror tests/README.md voorstel)
- ✅ storageState herbruik in playwright config
- ✅ 7 authenticated tests die acceptance criteria van S1/S4/S6/S8/S9 valideren

## Status update bij merge

Bij merge: master-plan S11 → ✅ DONE + PR-nummer. Direct start Sprint 12 (per-feature regression tests Betalingen/Contacten/Rapportages/Vragenlijsten, 4u).
