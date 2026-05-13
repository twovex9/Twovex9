# BS2 Sitemap — Fase A scrape (in progress)

**Start**: 2026-05-13
**Doel**: alle BS2-pagina's systematisch in kaart brengen + per pagina scrape-template invullen

## Modules (volgorde van scrape)

| # | Module | Folder | Status |
|---|---|---|---|
| 01 | Home + nieuws-feed | `docs/bs2-scrape/01-home/` | ✅ 100% HARDCORE (PR #48 + #50) |
| 02 | Planning | `docs/bs2-scrape/02-planning/` | 🟡 batch 1 ~30% (PR #49 merged), batch 2 in progress |
| 03 | Urenregistratie | `docs/bs2-scrape/03-urenregistratie/` | ⏳ TODO |
| 04 | HR - Medewerkers | `docs/bs2-scrape/04-hr-medewerkers/` | ⏳ TODO |
| 05 | HR - Competenties | `docs/bs2-scrape/05-hr-competenties/` | ⏳ TODO |
| 06 | HR - Opleidingen | `docs/bs2-scrape/06-hr-opleidingen/` | ⏳ TODO |
| 07 | HR - Locaties | `docs/bs2-scrape/07-hr-locaties/` | ⏳ TODO |
| 08 | HR - Salarishuis | `docs/bs2-scrape/08-hr-salarishuis/` | ⏳ TODO |
| 09 | HR - Bureau's | `docs/bs2-scrape/09-hr-bureaus/` | ⏳ TODO |
| 10 | HR - Salarisadministratie | `docs/bs2-scrape/10-hr-salarisadmin/` | ⏳ TODO |
| 11 | HR - Verlof | `docs/bs2-scrape/11-hr-verlof/` | ⏳ TODO |
| 12 | HR - Verzuim | `docs/bs2-scrape/12-hr-verzuim/` | ⏳ TODO |
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

## Per module 5 bestanden + screenshots

Voor élke module:
- `structure.md` — DOM-structuur (sitemap, toolbar, tabel, dropdowns, knoppen)
- `behaviors.md` — wat élke actie doet (modals, validatie, network, audit)
- `emails.md` — uitgaande e-mails (indien aanwezig)
- `prints.md` — print/PDF/Excel-exports (indien aanwezig)
- `bulk-actions.md` — bulk-acties (indien aanwezig)
- `img/` — screenshots per sub-page

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
