# Module 14 — Cliënten overview — BEHAVIORS

## Add-flow

1. Klik `#cl-add-open-btn` (Cliënt toevoegen, primary) → `#cl-add-modal` opent
2. Form velden invullen (voornaam/achternaam/clientnummer/locatie/fase/gemeente/organisatie)
3. Submit → INSERT in `public.clienten` via clientenDB
4. Modal sluit + tabel refresht
5. Close-ways (na Bug #40 fix): X (`#cl-add-close`) ✅ / Escape ✅ / Overlay-click ✅

## Search

- Live filter op `#cl-search` input
- Filtert op alle zichtbare kolom-teksten
- Verbergt non-matching rows via display:none

## Gearchiveerd-toggle

- `#cl-archived-toggle` aan → toon alleen `archived=true` records
- Uit (default) → toon alleen `archived=false` records

## Datum-filter

- `#cl-inzorg-datum` (date input) → filtert op `bs2_care_start_date` of fase change

## Kolommen-toggle

- Klik `#cl-columns-menu-btn` → floating panel met toggles per kolom
- Default: alle ✓ aan

## Archive-flow

1. Klik trash-icon (`.cl-archive-btn`) op rij → `#cl-archive-modal` opent
2. Slider-confirm pattern: sleep tot 100% → `Archiveren`-knop activeert
3. Klik → `clientenDB.archive(id)` (sets archived=true)
4. Modal sluit + tabel refresht
5. Close-ways: X (`#cl-ar-close`) ✅ / Escape ✅ / Overlay ✅

## Restore-flow

1. Zet Gearchiveerd-toggle aan
2. Per row: `Herstel`-knop (`.btn-outline.hr-restore-btn`) boven trash
3. Klik Herstel → `clientenDB.restore(id)` direct, geen modal

## Purge-flow (definitief verwijderen, alleen archived)

1. Klik trash-icon op gearchiveerde rij → `#cl-purge-modal` opent
2. Slider-confirm pattern
3. Klik bevestig → hard DELETE uit Supabase
4. Close-ways: X / Escape / Overlay ✅

## Export

- Klik `#cl-export-btn` → CSV/Excel-export download
- Bevat alle zichtbare kolommen + gefilterde rows

## Sort

- BS2 heeft th-sort dropdowns per kolom (Asc/Desc/Hide)
- BS1: header-click sort

## Pagination

- BS2: Rows per page 10/15/30/40/50
- BS1: pager met first/prev/next/last buttons
