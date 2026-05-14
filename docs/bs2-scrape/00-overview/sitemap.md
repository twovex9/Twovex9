# BS2 Sitemap — Fase A scrape (in progress)

**Start**: 2026-05-13
**Doel**: alle BS2-pagina's systematisch in kaart brengen + per pagina scrape-template invullen

## Modules (volgorde van scrape)

| # | Module | Folder | Status |
|---|---|---|---|
| 01 | Home + nieuws-feed | `docs/bs2-scrape/01-home/` | ✅ **DONE** (user-override 2026-05-14: "Module 1 voor 100% is afgerond"). PR #48+#50+#55+#57+#58+#59 merged. Lockdown 30/30 + data-pariteit 15=15 + body match + 2 CLEAN RUNS 13/13 elk |
| 02 | Planning | `docs/bs2-scrape/02-planning/` | ✅ **DONE** (user-override 2026-05-14 via "deze module is afgerond + naar volgende"). PR #49-#68 merged. Lockdown 30/30 + data-pariteit 4461/9/196 + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor. 16 bugs gefixt. |
| 03 | Urenregistratie | `docs/bs2-scrape/03-urenregistratie/` | ✅ **DONE** (user-override 2026-05-14 "100% in orde bevestigd"). PR #70+#71 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. 4227 records geïmporteerd. Bug #17 gefixt. |
| 04 | HR - Medewerkers | `docs/bs2-scrape/04-hr-medewerkers/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid bevestigd"). PR #73+#74 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. 198 medewerkers. Bug #18 gefixt. |
| 05 | HR - Competenties | `docs/bs2-scrape/05-hr-competenties/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid"). PR #75+#76+#77+#78 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. Data-pariteit 1=1. Bugs #19+#20 gefixt. Detail-page + ••• menu volledig getest. |
| 06 | HR - Opleidingen | `docs/bs2-scrape/06-hr-opleidingen/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid"). PR #79+#80 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. Data-pariteit BS1=BS2=69. Bugs #21+#22 gefixt. |
| 07 | HR - Locaties | `docs/bs2-scrape/07-hr-locaties/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid"). PR #81+#82 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. Data-pariteit BS1=BS2=11. Bugs #23+#24 gefixt. |
| 08 | HR - Salarishuis | `docs/bs2-scrape/08-hr-salarishuis/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid"). PR #83+#84 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. Data-pariteit BS1=BS2=13. Bugs #25+#27 gefixt. |
| 09 | HR - Bureau's | `docs/bs2-scrape/09-hr-bureaus/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid"). PR #85+#86 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. Data-pariteit BS1=BS2=4. Bugs #28+#29 gefixt. |
| 10 | HR - Salarisadministratie | `docs/bs2-scrape/10-hr-salarisadmin/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid"). PR #87+#88+#89 merged. LOCKDOWN 30/30 + 2 CLEAN RUNS. Bug #30 gefixt. Data-pariteit functioneel 100%. |
| 11 | HR - Verlof | `docs/bs2-scrape/11-hr-verlof/` | ✅ **DONE** (user-override 2026-05-14 "100% zekerheid bevestigd"). PR #91+#93+#94 merged. LOCKDOWN 30/30 + 4 CLEAN RUNS (2 pre + 2 post-restructure) + ULTRA-DEEP 100% test op 33 pagina's. Bugs gefixt: #31 (Escape+Overlay modals) + #32 (sidebar-relocation conform BS2). 4 pagina's: verlof.html + 3 stubs (verlofstanden/plus-minuren/verloftypes). |
| 12 | HR - Verzuim | `docs/bs2-scrape/12-hr-verzuim/` | 🟡 **IN-PROGRESS** (gestart 2026-05-14) |
| 13 | HR - Nieuws | `docs/bs2-scrape/13-hr-nieuws/` | ⏳ TODO |
| 14 | Cliënten - overview | `docs/bs2-scrape/14-clienten-overview/` | ⏳ TODO |
| 15 | Cliënten - Zorgsoorten | `docs/bs2-scrape/15-clienten-zorgsoorten/` | ⏳ TODO |
| 16 | Cliënten - Beschikkingen | `docs/bs2-scrape/16-clienten-beschikkingen/` | ⏳ TODO |
| 17 | Cliënten - Organisaties | `docs/bs2-scrape/17-clienten-organisaties/` | ⏳ TODO |
| 18 | Cliënten - Gemeenten | `docs/bs2-scrape/18-clienten-gemeenten/` | ⏳ TODO |
| 19 | Cliënten - Urendeclaraties | `docs/bs2-scrape/19-clienten-urendeclaraties/` | ⏳ TODO |
| 20 | Cliënten - Uren budgetering | `docs/bs2-scrape/20-clienten-uren-budget/` | ⏳ TODO |
| 21 | Cliënten - Facturen importeren | `docs/bs2-scrape/21-clienten-facturen-import/` | ⏳ TODO |
| 22 | Cliënten - Incidenten | `docs/bs2-scrape/22-clienten-incidenten/` | ⏳ TODO |
| 23 | Kilometers | `docs/bs2-scrape/23-kilometers/` | ⏳ TODO |
| 24 | Facturen - te beoordelen | `docs/bs2-scrape/24-facturen-beoordelen/` | ⏳ TODO |
| 25 | Facturen - alle (monthly) | `docs/bs2-scrape/25-facturen-alle/` | ⏳ TODO |
| 26 | Taken | `docs/bs2-scrape/26-taken/` | ⏳ TODO |
| 27 | Medewerker-detail (per persoon) | `docs/bs2-scrape/27-medewerker-detail/` | ⏳ TODO |
| 28 | Beleid (documents) | `docs/bs2-scrape/28-beleid/` | ⏳ TODO |
| 29 | Audit | `docs/bs2-scrape/29-audit/` | ⏳ TODO |
| 30 | Organisatie - Rollen | `docs/bs2-scrape/30-organisatie-rollen/` | ⏳ TODO |
| 31 | Organisatie - Teams | `docs/bs2-scrape/31-organisatie-teams/` | ⏳ TODO |
| 32 | Instellingen - Gebruikers | `docs/bs2-scrape/32-instellingen-gebruikers/` | ⏳ TODO |
| 33 | Instellingen - Entiteiten | `docs/bs2-scrape/33-instellingen-entiteiten/` | ⏳ TODO |
| 34 | Instellingen - Notificaties | `docs/bs2-scrape/34-instellingen-notificaties/` | ⏳ TODO |
| 35 | Mijn-gegevens | `docs/bs2-scrape/35-mijn-gegevens/` | ⏳ TODO |
| 36 | Manual (/manual) | `docs/bs2-scrape/36-manual/` | ⏳ TODO |

## Per module 7 bestanden + screenshots (VERPLICHT vanaf 2026-05-14)

Voor élke module:
- `structure.md` — BS2 DOM-structuur (sitemap, toolbar, tabel, dropdowns, knoppen) — HARDCORE
- `behaviors.md` — BS2 gedrag per actie (modals, validatie, network, audit) — HARDCORE
- `emails.md` — BS2 uitgaande e-mails (indien aanwezig)
- `prints.md` — BS2 print/PDF/Excel-exports (indien aanwezig)
- `bulk-actions.md` — BS2 bulk-acties (indien aanwezig)
- **`bs1-parity.md` — BS1 status vs BS2 (Chrome MCP test + schema-check + per-actie ✅/🟡/❌/❓ tabel + gap-categorisatie + Fase E-prioritering) — EVEN HARDCORE als BS2-scrape**
- **`lockdown-checklist.md` — 30-items hardcore-verificatie (10 BS2 + 10 BS1 + 10 Schema/Data/Audit) MET BEWIJS per item. Module status mag NIET ✅ zonder 30/30 + user-override. Zie `_template/lockdown-checklist.md` voor vorm.**
- `img/` — screenshots per sub-page (BS2 + BS1 waar relevant)

## 🔒 LOCKDOWN-regel (user 2026-05-14, ABSOLUTE bindend)

Geen module mag status `✅ DONE` krijgen zonder **30/30 ✅ in lockdown-checklist.md + user-override-tekst**. Override-teksten (alleen user kan geven):
- `LOCKDOWN OVERRIDE GO`
- `Ja, ga door zonder volledige hardcore-test`
- `User-override: doorgaan naar volgende module`

Status-symbolen in deze sitemap:
- ⏳ TODO — niet gestart
- 🟡 IN-PROGRESS — gestart, niet alle items afgewerkt OF wachten op override
- ✅ DONE — 30/30 ✅ + user-override ontvangen

## Tools

- `mcp__Claude_in_Chrome__navigate` — naar BS2-URL
- `mcp__Claude_in_Chrome__read_page` + `get_page_text` — DOM dump
- `mcp__Claude_in_Chrome__find` — element-zoeker
- `mcp__Claude_in_Chrome__javascript_tool` — click via DOM
- `mcp__Claude_in_Chrome__computer screenshot` — visuele snapshot
- `mcp__Claude_in_Chrome__read_network_requests` — XHR + WebSocket
- `mcp__Claude_in_Chrome__read_console_messages` — JS-errors

## Volgorde-regel

Sequentieel module 01 → 36. Geen sprongen. Eindrapport per module = 100% ✅ vóór door naar volgende.

## Test-records prefix

Per CRUD-entiteit maak ik in BS2 één test-record met naam: `ZZZ-CLAUDE-TEST-2026-05-13`

Doel: archief/restore/delete/audit-flow capturen zonder echte productie-data te beïnvloeden. Filter uit bij import naar BS1.
