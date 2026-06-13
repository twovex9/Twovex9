# v3 — Complete BS2 scrape + BS1 mirror + productie-launch

**Status**: 🚀 ACTIEF vanaf 2026-05-13
**Plan-file**: `C:\Users\sonck\.claude\plans\ik-wil-een-beetje-temporal-scott.md`
**Memory**: `~/.claude/projects/.../memory/project_ff_v2_parity.md`

## Doel

100% letterlijke BS2-kopie in BS1 (alle features, data, gedrag, e-mails, prints, bulk-acties, real-time, audit, retention) — behoud alleen BS1-huisstijl. Plus productie-klaar voor 100+ medewerkers met verplichte 2FA.

**User-quote 2026-05-13 (bindend)**:
> "Het is belangrijk dat het personeel het gewoon kan gebruiken. Dat ik aan mijn baas kan bellen en zeggen 'het systeem is klaar, we kunnen het gebruiken in de praktijk met meer dan 100 personeelsleden zonder dat ze enige fouten ondervinden'. Niet 99,9 procent, nee 100 procent."

## 32 user-keuzes vastgelegd

Zie plan-file + memory voor volledige tabel. Highlights:

- **Test-records BS2**: prefix `ZZZ-CLAUDE-TEST-<YYYY-MM-DD>`, laten staan
- **12 rollen scrapen** (skip `medewerkertest`): eigenaar, admin, directeur, planner, cliëntbeheer, teamleider, HR, gedragswetenschapper, facilitair, financiën, salarisadministratie, medewerker-beleid
- **Admin-tier** (mag user-management): eigenaar + admin + directeur
- **Onboarding**: `Welkom123` + verplichte wachtwoord-wijziging + verplichte 2FA
- **2FA**: TOTP authenticator-app, alleen admin-reset (geen backup-codes)
- **Wachtwoord-vergeten**: Supabase Auth e-mail-recovery via Resend
- **Real-time**: Supabase Realtime channels (1-op-1 BS2-WebSocket)
- **Concurrent edits**: optimistic locking + warning-modal
- **Bulk-acties**: 1-op-1 BS2-scrape
- **PDF/print**: 1-op-1 BS2-scrape
- **Notification e-mails**: 1-op-1 BS2 via Resend + ETF-branded templates
- **Read-audit**: log wie wanneer welke data zag (GDPR)
- **DSR-flow**: GDPR-export + 'Vergeet cliënt' (anonymiseer) per cliënt
- **Off-boarding**: records behouden, gedeactiveerde profile blijft als FK
- **Cut-over**: big-bang op user-gekozen datum
- **Supabase plan**: upgrade naar Pro ($25/mnd) + EU-region
- **DNS-records**: SPF+DKIM+DMARC voor `etfalkmaar.nl` via Resend
- **Productie-URL**: blijft `https://futureflow-app.vercel.app`
- **Documentatie**: GEEN aparte handleidingen (baas wordt admin)
- **Monitoring**: Sentry + Supabase logs + Vercel deploy-notifications
- **Daily backup**: Supabase scheduled Edge Function 03:00 + 30d retention

## 9 fasen + 4-pass eindverificatie

### Fase 0 — Pre-productie setup (~4-6u)
User-acties begeleid + verifieer via Chrome MCP:
- 0.0 Supabase Pro upgrade + EU-region check
- 0.1 Supabase DPA tekenen
- 0.2 Vercel DPA tekenen
- 0.3 Resend setup + DNS-records + SMTP-config
- 0.4 pg_dump backup-test
- 0.5 Sentry-integratie
- 0.6 Dagelijkse backup Edge Function
- 0.7 Triple-check (8 punten ✅)

### Fase A — Structurele scrape (~10-14u)
Pre: vraag user BS2 in te loggen als **admin**.

Per BS2-pagina:
1. DOM-snapshot + screenshot
2. Élk dropdown / filter / kolom-kiezer openen + opties capturen
3. Per knop: klik → modal + form-velden + validatie capturen
4. Network-requests + WebSocket-events
5. Test-record-flow `ZZZ-CLAUDE-TEST-<datum>`
6. Output: `docs/bs2-scrape/<module>/structure.md` + `behaviors.md` + `emails.md` + `prints.md` + `bulk-actions.md`

Modules: home, planning, urenregistratie, hr×10sub, cliënten×9sub + per-client tabs, kilometers, facturen×2sub, taken, medewerker-detail, beleid, audit, organisatie×2sub, instellingen×3sub, mijn-gegevens, /manual.

### Fase B — Data-scrape (~5-9u)
In BS2 console JS-snippet:
- Paginated fetch élke API-endpoint
- Per parent detail-endpoint
- Audit-log incl. read-audit
- Excel-exporten downloaden
- WebSocket-events log

### Fase C — Storage-scrape (~3-7u)
- Authenticated fetch in BS2 voor élke file-URL
- Upload BS1 Storage
- Mapping in `scripts/bs2-exports/storage-map.json`

### Fase D — Schema-diff + gap-report (~3-5u)
Output `docs/phase4/v3-gap-report.md` per categorie: schema, UI, behavior, data, storage, audit, real-time, e-mail, PDF, bulk, locking, timeout, retention.

### Fase E — Build + fix-PRs (~18-45u)
Per gap-categorie sequentieel fix-PR. Workflow:
- `git switch -c feature/v3-fix-<slug>`
- Edit + commit + push + `gh pr create`
- "Klik om te mergen" link aan user
- Wacht merge → live-verifieer via Chrome MCP

Categorieën: schema, UI, behavior, data, storage, audit, real-time, e-mail, PDF, bulk, optimistic-locking, session-timeout, retention, DSR-flow, off-boarding.

### Fase F — Rol-scrape + permissies-matrix (~14-22u)
Voor élke 12 rollen sequentieel:
1. Vraag user BS2 in te loggen als rol X
2. Scrape sidebar + per pagina alle elementen
3. Output `docs/bs2-scrape/roles/<rol>.md`
4. Bouw BS1: RLS-policies + UI-conditionals + sidebar-filter
5. Verifieer met BS1 test-account

### Fase G — Auth + onboarding + 2FA + helpdesk (~10-14u)
- G.1 Schema: `profiles.must_change_password` + `must_setup_2fa` + 13 rollen enum
- G.2 Bulk-onboarding `scripts/onboard-bs2-employees.mjs`
- G.3 First-login wachtwoord-modal
- G.4 2FA-setup wizard (TOTP)
- G.5 Gebruikers-tab (admin-tier only) + password/2FA reset
- G.6 Wachtwoord-vergeten flow + `reset-password.html`
- G.7 Audit-logging user-management
- G.8 Helpdesk-link in topbar + login
- G.9 ETF-branded e-mail-templates

### Fase I — Pre-launch cleanup (~2-3u)
Vlak vóór go-live:
- `scripts/pre-launch-cleanup.mjs` DELETE alle `ZZZ-CLAUDE-TEST` + test-accounts
- Finale BS2 → BS1 sync
- Mass-mail template in `docs/handleidingen/go-live-mail-template.md`
- Smoke-test laatste keer

### Fase H — 4-pass eindverificatie (~8-12u)

**Pass 1 — Module-by-module BS2 ↔ BS1**: élke module side-by-side via Chrome MCP, doorloop élke klik.

**Pass 2 — Per-rol-verificatie**: login BS1 met test-account per rol, doorloop alles, vergelijk met `roles/<rol>.md`.

**Pass 3 — End-to-end critical-path tests**: onboarding, wachtwoord-vergeten, admin-reset, 2FA-reset, real-time, optimistic-locking, session-timeout, PDF-print, bulk-actie, e-mail, read-audit.

**Pass 4 — User-handmatige steekproef**: ik beschrijf 8 willekeurige flows aan user voor handmatige test.

**Eindrapport** `docs/phase4/99-v3-eindrapport.md` met alle bewijzen.

## Triple-check per fase

Élke fase eindigt met checklist. Bij ❌ → herstellen, niet door naar volgende fase.

## Slot-criteria "kan aan baas afleveren"

ALLE waar:
1. ✅ Fase 0-G + I + H triple-check groen
2. ✅ Pass 1-4 in Fase H = 100% ✅
3. ✅ Fase I cleanup: 0 `ZZZ-CLAUDE-TEST` records + mass-mail klaar
4. ✅ Eindrapport `99-v3-eindrapport.md` met alle bewijzen
5. ✅ Memory + CLAUDE.md status `v3 100% PRODUCTIE-KLAAR voor go-live`

**Geen "99,9%". Een ❌ → herstel + alle 4 passes opnieuw.**

## Workflow-regels (uit memory, blijven gelden)

1. Feature-branch + PR per fix (sandbox blokkeert direct-to-main)
2. "Klik om te mergen" format voor élke PR
3. Items 29+ in `docs/phase4/open-items/<NN>-<slug>.md`
4. Per fase 1 status-update
5. BS2 = sandbox alles mag, Supabase/Vercel/GitHub = NOOIT delete
6. PII-classifier workaround: in-browser JS-snippet
7. Rol-omschakeling: vóór élke rol-test vraag user

## Stoppen voor 2 redenen

Alleen stoppen voor:
1. **Merge nodig** → "Klik om te mergen" link aan user
2. **User-fysiek-werk** → DPA tekenen, service-role key kopiëren, BS2 omschakelen, DNS-records, smartphone voor 2FA-test

## Bij hervatting na compactie

1. Lees `future-flow/CLAUDE.md`
2. Lees memory `project_ff_v2_parity.md`
3. Lees plan-file
4. Check status alle fases in memory
5. Vind eerste `⏳ TODO` of `🟡 IN PROGRESS`
6. Hervat exact daar — NOOIT vragen "welke fase?"

## Verwachte effort + tempo

| Fase | Effort |
|---|---|
| 0 (pre-productie) | 4-6u |
| A (structuur-scrape) | 10-14u |
| B (data-scrape) | 5-9u |
| C (storage-scrape) | 3-7u |
| D (gap-report) | 3-5u |
| E (build + fixes) | 18-45u |
| F (rollen-matrix) | 14-22u |
| G (auth + onboarding) | 10-14u |
| I (pre-launch cleanup) | 2-3u |
| H (4-pass verify) | 8-12u |
| **Totaal** | **77-136u** (10-17 werkdagen autonoom) |

Per fase 1 status-rapport.
