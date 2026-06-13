# Module 33 — Instellingen / Entiteiten — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/settings/entities`
**BS1 URL**: `https://futureflow-app.vercel.app/instellingen.html` (Entiteiten-tab)
**Scrape datum**: 2026-05-14

## BS2 page

- Title: "Entiteiten | Embrace The Future"
- h1: "Entiteiten"
- 3 sub-tabs (in Instellingen): Gebruikers / Entiteiten / Notificaties
- Toolbar: Kolommen
- Table cols (1): Naam
- 7 entities totaal: client / employee / disposition / invoice / quotation / Disposition / Phase
- Pagination: 15 of 7 total, Page 1 of 1 (RPP 10/15/30/40/50)

## BS1 mirror

- Title: "Instellingen — HR"
- 5 tabs (BS1 superset): Mijn profiel / Gebruikers / Mijn notificaties / Notificatietypes / **Entiteiten**
- Toolbar: Kolommen / Search "Zoeken..."
- Table cols (3, BS1 superset): Naam (monospace) / Beschrijving / Aantal records
- Footer: "X van Y" count
- 7 entities 1:1 match BS2

### BS1 entiteiten + counts uit Supabase

| Naam | Beschrijving | bs1_table | Aantal records |
|---|---|---|---|
| client | Cliënt-entiteit | clienten | 160 |
| employee | Medewerker-entiteit | medewerkers | 103 |
| disposition | Beschikking-entiteit | beschikkingen | 251 |
| invoice | Factuur-entiteit | facturen | 990 |
| quotation | Offerte-entiteit | (geen) | — |
| Disposition | Beschikking-fase entiteit | (geen) | — |
| Phase | Fase-entiteit (algemeen) | (geen) | — |

## Bug gefixt

### Bug #67 (UX) — Missing empty-state placeholder bij 0 search-results

`renderEntiteiten` in instellingen.js (regel 311-323) zette `tbody.innerHTML = filtered.map(...).join("")` zonder check op `filtered.length === 0`. Als search-query 0 resultaten gaf → leeg `<tbody>` (geen placeholder), inconsistent met Gebruikers-tab die "Geen gebruikers gevonden." toont.

**Fix in instellingen.js**: `if (filtered.length === 0)` check toegevoegd met "Geen entiteiten gevonden." placeholder-rij (`colspan="3"`, gestyled grijs).

## Schema

- **Hardcoded array** `ENTITEITEN_LIST` in instellingen.js (regel 201-209)
- Lijst spiegelt 7 BS2 Laravel-models
- Records-counts dynamic via Supabase `getEntCount(table)`:
  - 4 met bs1_table mapping → live count uit DB
  - 3 zonder bs1_table (quotation/Disposition/Phase) → "—" placeholder
- TD-cellen hebben `data-col` attribuut (Bug #64-pattern al goed)
- Read-only viewer, geen CRUD
