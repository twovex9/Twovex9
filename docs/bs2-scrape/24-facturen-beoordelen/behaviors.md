# Module 24 — Facturen te beoordelen — BEHAVIORS

## Default view
- Filter op TODO_STATUSES: Concept / Ingediend / In beoordeling / Afgewezen / Verlopen
- Toont 15 "Ingediend" records (na Bug #56 fix)

## Filter chips (na Bug #55 fix)
- `+ Status` chip (#fact-tb-status-chip) → opent search-select panel met status-opties
- `+ Periode` chip (#fact-tb-period-chip) → opent date-range picker
- Beide chips tonen actieve waarde wanneer geselecteerd

## Search
- Live filter via #fact-tb-search op factuurnummer / cliënt / beschikking / status

## Gearchiveerd-toggle
- #fact-tb-archived: swap actief/archived view

## Stats header (real-time)
- "€ X / Y Totaal te beoordelen" (filtered by TODO_STATUSES)
- "€ X / N Totaal goedgekeurd" (Betaald-count)

## Pagination
- 50 rows per page default
- First/Prev/Next/Last buttons

## Kolommen
- 5 toggles (Maand/Medewerker/Factuurnummer/Status/Aanmaakdatum/Bedrag)

## Sort
- Per kolom header → ASC/DESC toggle

## Events
- `ff:facturen-updated` op window bij mutaties
