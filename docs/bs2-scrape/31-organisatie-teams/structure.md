# Module 31 — Organisatie / Teams — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/organization/teams`
**BS1 URL**: `https://futureflow-app.vercel.app/teams.html`
**Scrape datum**: 2026-05-14

## BS2 page

- Title: "Embrace The Future"
- h1: "Organisatie" / breadcrumb "Organisatie"
- 2 tabs: Rollen / **Teams** (active)
- Subtitle: "Beheer teams, toewijzingen en organisatiestructuur"
- 4 stat-cards: Totaal teams (10) / Totaal medewerkers (98) / Teamleiders (3) / Locaties (10)
- Toolbar: Team-tab / Kolommen / Add Team / Gearchiveerd
- Table cols: Naam / Locatie / Medewerkers / Teamleider / Aangemaakt op / Laatst gewijzigd
- 10 teams totaal

### BS2 teams (10)
1. Kantoor Magdalenenstraat — Kantoor Magdalenenstraat — 1 medewerker — 0 teamleiders
2. Zijperstraat — Zijperstraat — 4 — 0
3. Voorburggracht — Voorburggracht — 49 — 0
4. Varnebroek — Varnebroek — 47 — 0
5. Magdalenenstraat — Magdalenenstraat — 60 — 0
6. Breedstraat — Breedstraat — 23 — 0
7. Leonard Bramerstraat — Leonard Bramerstraat — 32 — 0
8. Achterwacht — Achterwacht — 6 — 0
9. Ambulant Extern — (geen locatie) — 2 — 1 teamleider
10. WLZ — (geen locatie) — 5 — 1 teamleider

## BS1 mirror

- Title: "Teams — Organisatie"
- h1: "Teams"
- Toolbar: + Team toevoegen / Zoeken / Gearchiveerd-toggle
- Table cols: TEAM / BESCHRIJVING / TEAMLEIDER / LOCATIE / LEDEN / AANGEMAAKT (6 cols)
- Pagination: 10/15/30/50 + first/prev/next/last
- 10 teams (na Bug #65 import)

## BS1 modals (4 totaal)

| Modal-ID | Class | Doel |
|---|---|---|
| `teams-add-modal` | `emp-verzuim-modal-overlay` (display) | Add/Edit team form (naam/beschrijving/teamleider/locatie) |
| `teams-members-modal` | `emp-verzuim-modal-overlay` (display) | Manage team members (add/remove/set-role) |
| `teams-archive-modal` | `modal-overlay modal-overlay--confirm` (hidden) | Slider-confirm archive |
| `teams-purge-modal` | `modal-overlay modal-overlay--confirm` (hidden) | Slider-confirm purge |

Na Bug #66 fix: alle 4 modals × 3 close-ways = 12/12 ✅ (X / Escape / Overlay)

## Bugs gefixt

### Bug #65 (data) — 10 missing teams BS1

BS1 had 0 teams in DB, BS2 had 10. SQL INSERT van 10 teams in `public.teams`:
- 8 met `locatie_id` FK (Kantoor Magdalenenstraat → Achterwacht)
- 2 zonder locatie (Ambulant Extern + WLZ, locatie_id=NULL)
- Beschrijving=NULL voor allemaal (BS2 toont ook geen beschrijving)
- aanmaakdatum/laatst_gewijzigd uit BS2 timestamps

### Bug #66 (UI) — 4 teams-modals × 2 missing close-ways

`teams-add-modal` + `teams-members-modal` + `teams-archive-modal` + `teams-purge-modal` misten Escape + Overlay-click close-ways. Alleen X-button + Cancel-button werkten.

**Fix in teams.js**: globale `initGlobalCloseForTeamsModals()`:
- DISPLAY_IDS (style.display): teams-add-modal, teams-members-modal
- HIDDEN_IDS (hidden-attr): teams-archive-modal, teams-purge-modal
- Globale Escape keydown-handler (modal-type-aware visibility check)
- Per-modal overlay-click handler (e.target === m)

## Schema

- `public.teams` (10 records na Bug #65 import) — id uuid / naam / beschrijving / team_leider_id (uuid → medewerker) / locatie_id (uuid → locatie) / archived / aanmaakdatum / laatst_gewijzigd
- `public.medewerker_teams` (many-to-many) — medewerker_id / team_id / rol_in_team
- 11 locaties in DB, 8 matchen BS2 teams op naam
