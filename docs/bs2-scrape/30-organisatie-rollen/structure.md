# Module 30 — Organisatie / Rollen — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/organization/roles`
**BS1 URL**: `https://futureflow-app.vercel.app/rollen.html`
**Scrape datum**: 2026-05-14

## BS2 page

- Title: "Rollen | Embrace The Future"
- 2 tabs: Rollen / Teams (top-level)
- Section breadcrumb: "Organisatie / Rollen"
- Description: "Breng wijzigingen aan in de organogram door rollen te slepen en neer te zetten tussen verschillende hiërarchieniveaus. Vergeet niet uw wijzigingen op te slaan."
- Toolbar buttons: Opslaan / Reset / Nieuwe rol / Nieuwe sectie
- Zoom level: 100%
- Hierarchische structuur met 6 secties × N rollen × user-counts

### BS2 sections + rollen

1. **Eigenaarschap** (1 rol)
   - Eigenaar (3 gebruikers)
2. **Topmanagement** (2 rollen)
   - Admin (5), Directeur (1)
3. **Middenmanagement** (3 rollen)
   - Planner (4), Cliëntbeheer (0), Teamleider (2)
4. **Specialisten & Adviseurs** (5 rollen)
   - HR (1), Gedragswetenschapper (2), Facilitair (2), Finance (2), Salarisadministratie (2)
5. **Uitvoerend Personeel** (3 rollen)
   - Medewerker (102), Beleid (1), Medewerker Test (0)
6. **test** (0 rollen — leeg, test-data uit BS2 sandbox)

**Totaal**: 6 secties / 14 rollen / 127 gebruikers (in BS2 sandbox).

## BS1 mirror

- Title: "Rollen — Organisatie"
- h1: "Rollen"
- Subtitle: "Hiërarchisch overzicht van rollen en het aantal gebruikers per rol."
- Toolbar: Zoeken (rol of sectie)
- Totaal-counter: "14 rollen, X gebruikers"
- Read-only viewer (CRUD komt v3 Fase E)

### BS1 sections + rollen (1:1 match met BS2)

1. **Eigenaarschap** — Eigenaar (1 rol)
2. **Topmanagement** — Admin, Directeur (2 rollen)
3. **Middenmanagement** — Planner, Cliëntbeheer, Teamleider (3 rollen)
4. **Specialisten & Adviseurs** — HR, Gedragswetenschapper, Facilitair, Finance, Salarisadministratie (5 rollen)
5. **Uitvoerend Personeel** — Medewerker, Beleid, Medewerker Test (3 rollen)

**Section descriptions**:
- Eigenaarschap → "Eigenaren en hoogste verantwoordelijken"
- Topmanagement → "Directie en organisatie-brede leiding"
- Middenmanagement → "Teamleiders, planners, cliëntbeheer"
- Specialisten & Adviseurs → "Specialistische functies en adviseurs"
- Uitvoerend Personeel → "Uitvoerende medewerkers"

**Card descriptions** (BS1 superset, BS2 toont niet):
- Eigenaar → Eigenaar van de organisatie
- Admin → Systeem-administrator
- Directeur → Directie
- Planner → Planning + rooster
- Cliëntbeheer → Cliënt-coördinator
- Teamleider → Teamleiding
- HR → HR functies
- Gedragswetenschapper → Gedragswetenschapper
- Facilitair → Facilitaire dienst
- Finance → Financiële afdeling
- Salarisadministratie → Salarisadministratie
- Medewerker → Uitvoerend medewerker
- Beleid → Beleidsmedewerker
- Medewerker Test → Test-account

## BS1 layout (CSS classes)

- `.rollen-organogram` — main container
- `.rollen-section` — section card per hiërarchieniveau
- `.rollen-section-head` — title + meta
- `.rollen-section-title` (h2) + `.rollen-section-meta` (X rollen · Y gebruikers)
- `.rollen-section-desc` (p) — section beschrijving
- `.rollen-cards` — grid van rol-kaarten
- `.rollen-card` + `.rollen-card--empty` (modifier voor 0 gebruikers)
- `.rollen-card-head` — title + badge
- `.rollen-card-title` (h3) + `.rollen-card-badge` (X gebruikers)
- `.rollen-card-desc` (p) — rol beschrijving

## Geen bugs gevonden in Module 30

BS1 toont 5 secties + 14 rollen identiek aan BS2 (op naam + volgorde + groepering). Card descriptions zijn extra BS1-feature.

**User-count gap** (BS2 127 vs BS1 1) is een v3 Fase G item (bulk-onboarding 102 medewerker-profielen), niet Module 30. BS1 toont accurate 1 gebruiker (test-admin) gekoppeld via `profiles.rol_id` → "Medewerker"-rol.

**"test" sectie** (BS2 sandbox-data, 0 rollen) is NIET overgenomen naar BS1 — geen functionele waarde, gewoon BS2 sandbox-clutter.

**CRUD toolbar buttons** (Opslaan/Reset/Nieuwe rol/Nieuwe sectie) zijn NIET in BS1 — komt v3 Fase E (drag-drop org-editor). Read-only viewer is current-phase scope.

## Schema

- 2 tabellen:
  - `public.org_role_sections` (5 records — id uuid, naam, volgorde, beschrijving, aanmaakdatum, laatst_gewijzigd)
  - `public.org_roles` (14 records — id uuid, section_id FK, naam, beschrijving, volgorde)
- 1 view:
  - `public.org_roles_with_counts` — joins org_roles + counts via `profiles.rol_id`
- `profiles.rol_id` (uuid, FK → org_roles.id)
- Sectie-volgorde 1-5 (Eigenaarschap → Uitvoerend Personeel)
- 14/14 rol-cards rendered ✅
