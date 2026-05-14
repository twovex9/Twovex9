# Module 25 — Facturen alle — BEHAVIORS

## Default view
- Geen status-filter: toont alle 990 records
- Pagination: 25 rows/page = 40 pagina's

## Add-flow
- Klik `+ Factuur aanmaken` → `#fact-add-modal` opent
- Form: factuurnummer / cliënt / beschikking / periode / bedrag / status
- Submit → INSERT in `public.facturen`
- Close (na Bug #58): X / Escape / Overlay alle 3 ✅

## Export-flow
- Klik `Exporteren` → `#fact-export-modal` opent
- Kolom-kiezer + formaat (CSV/Excel)
- Close (na Bug #58): X / Escape / Overlay alle 3 ✅

## Archive-flow
- Trash-icon op rij → `#fact-arch-modal` opent (slider)
- Close: X / Escape / Overlay alle 3 ✅

## Purge-flow
- Archived rij trash → `#fact-purge-modal` (slider)
- Close: X / Escape / Overlay alle 3 ✅

## Filters
- Search (#fact-search)
- 2 toggles: Verloopt binnen 60d / Gearchiveerd
- 4 dropdowns: Status / Declaratie methode / Periode / Betaald
- Reset-knop wist alles

## Sort
- Per kolom header click → ASC/DESC

## Events
- `besa:facturen-updated` op window
