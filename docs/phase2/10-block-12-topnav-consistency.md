# Phase 2 — Block 12: Top-nav consistency

**Datum**: 2026-05-12
**Commit**: `45a31b8`
**Status**: ✅ Alle 6 nieuwe pages canonical full-dropdown topbar

## Doel
Mijn 6 nieuwe pages gebruikten een vereenvoudigde flat top-nav (zonder dropdown sub-menus per module). De ~35 bestaande pages gebruiken een uitgebreidere variant met dropdowns voor Planning / Urenregistratie / HR / Cliënten / Kilometers / Facturen / Verlof / Organisatie. Block 12 unificeert mijn nieuwe pages naar dezelfde canonical structuur.

## Aanpak

### Probleemschets
- audit, instellingen, teams, verlof: 0 dropdowns (flat top-link voor alle 14 items)
- beleid, taken: 4 dropdowns (Planning/Urenregistratie/HR/Cliënten) maar Kilometers/Facturen/Verlof/Organisatie nog flat
- competenties (en alle andere oude pages): 8 dropdowns

### Geautomatiseerd via Node.js script

`scripts/topnav-consistency.mjs`: leest het canonical block (uit competenties.html), matcht het hele `<div class="top-nav-track">...</div>` block per file met regex, vervangt met canonical + is-active op de juiste anchor per page.

Per-page is-active mapping:
| File | Anchor | Class |
|---|---|---|
| audit.html | `<a href="audit.html">Audit` | `top-link is-active` (flat) |
| instellingen.html | `<a href="instellingen.html">Instellingen` | `top-link is-active` (flat) |
| beleid.html | `<a href="beleid.html">Beleid` | `top-link is-active` (flat) |
| taken.html | `<a href="taken.html">Taken` | `top-link is-active` (flat) |
| verlof.html | `<a href="verlof.html">Verlof` | `top-link top-link--dropdown is-active` (dropdown) |
| teams.html | `<a href="teams.html">Organisatie` | `top-link top-link--dropdown is-active` (dropdown) |

### Resultaat
- 6/6 files succesvol bijgewerkt
- 8 dropdowns per page (zelfde als alle bestaande pages)
- Is-active correct per page
- 281 inserts, 43 deletions over 6 HTML-files
- Script bewaard in `scripts/` voor herhaalbaarheid

## Verificatie

Live op `besa-suite.vercel.app/audit.html`:
- Volledige nav met 14 items (8 dropdowns + 6 flat-links)
- "Meer navigatie" overflow-button verschijnt op smallere viewports (verwacht; gebeurt ook op oude pages)
- Geen JS-errors

## Cumulatief sessie-overzicht

**23 commits totaal in Phase 2**, gestart van een lege gap-analyse tot een volledig BS2-vergelijkbare BS1 met:

### Nieuwe modules (6)
1. Beleidsdocumenten — admin + storage upload
2. Taken — workflow met status-pills
3. Teams — M2M medewerker_teams + members modal
4. Audit — read-only viewer met merged sources
5. Verlof — concept→ingediend→goedgekeurd flow
6. Instellingen — profile-edit + notification_types

### Nieuwe Supabase tabellen (7)
beleidsdocumenten, taken, teams, medewerker_teams, verlof_aanvragen, notification_types, audit_log

### Audit-coverage (11 tabellen via 10 triggers)
- 5 nieuwe tabellen: taken, beleidsdocumenten, verlof_aanvragen, teams, notification_types
- 5 bestaande tabellen: medewerkers, clienten, beschikkingen, facturen, incidenten
- 1 legacy bron: beschikking_audit_log (gemerged in viewer)

### UI polish
- Home: BS2-stijl datum-format ("mei 11, 2026") + initialen-avatars met deterministische kleuren
- Alle 6 nieuwe pages: canonical full-dropdown topbar (Block 12)

### Nav-link cleanup
Alle 6 `werkruimte.html#<fragment>` patronen vervangen door dedicated pages:
- #beleid → beleid.html
- #taken → taken.html
- #verlof → verlof.html
- #audit → audit.html
- #organisatie → teams.html
- #instellingen → instellingen.html

## Wat ontbreekt nog (user-action of niet-kritisch)

### User-action (geen code-werk)
- **Voornaam invullen** in Instellingen → "Welkom, Jason" op home
- **10 ontbrekende beleidsdocument volgnummers** via beleid.html UI
- **PDF-uploads** voor de 15 bestaande beleidsdocumenten

### Optioneel (volgende sessie)
- **Profile notification preferences M2M** — per-user opt-in per notification_type
- **Audit detail modal** — klik op rij → volledige payload-diff
- **Notification bell counter** in topbar — telt unread audit-events of taken
- **Test data seeding** voor demo (taken, teams, verlof) — pollueert productie

## Architecturale conclusies

1. **Patroon-replicatie werkt**: 6 modules in dezelfde sessie gebouwd door consequent het pattern van bestaande data-lagen (`medewerker-documenten-data.js`, `competenties.js`, etc.) te volgen
2. **Triggers zijn de juiste laag voor audit**: alle CRUD wordt gevangen ongeacht of het via JS, SQL of MCP komt
3. **Append-only audit_log + EXCEPTION-handling** voorkomt dat audit-failures parent-transacties blokkeren
4. **`SECURITY DEFINER` op triggers** is essentieel zodat audit-writes RLS overslaan (anders zou een user met enkel SELECT-rechten geen audit-trail krijgen)
5. **Sed + Node-scripts** voor bulk-HTML transformaties zijn herhaalbaar en gedocumenteerd in `scripts/`

Het project staat op een **complete-feature-parity met BS2** punt voor wat ETF/Embrace nodig heeft binnen BS1. Alle echte porting-gaps zijn gedicht.
