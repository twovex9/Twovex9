# Module 13 — HR Nieuws — BEHAVIORS

## Add-flow (`+ Nieuws toevoegen`)

1. Klik `#news-add-open-btn` → `#news-add-modal` opent
2. Velden: Afbeelding (file) / Naam (text, required) / Geplaatst door (text) / Inhoud (RTE)
3. Klik `Toevoegen` → INSERT in `public.nieuws` met status="Published" default
4. Modal sluit + tabel refresht
5. Close-ways: X (`#news-add-close-btn`) ✅ / Escape ✅ / Overlay ✅

## Edit-flow (klik op titel-link)

1. Klik `.news-title-link` op rij → `#news-edit-modal` opent (full-page editor)
2. Velden voorgevuld vanuit row dataset
3. RTE-editor met B/I/S/U/H1/H2/🔗/lijst/uitlijning
4. Image-uploads (primary + secondary)
5. Acties:
   - `Publiceer` → status → "Published"
   - `Wijzigingen opslaan` → UPDATE nieuws + closeNewsEdit
   - `Terug` (←) → closeNewsEdit (geen save)
   - `Meer opties` (⋯) → popover (Bug #37 fix):
     - Niet-archived: "Archiveren"
     - Archived: "Herstellen" + "Definitief verwijderen"
6. Close-ways: Terug ✅ / Escape ✅ / Overlay-click ✅ (geen X — design-choice)

## Archive-flow (trash-knop in tabel)

1. Klik `.news-archive-btn` op rij → `#news-delete-modal` opent (= archive modal)
2. Slider-confirm pattern: sleep tot 100% → `Verwijderen`-knop activeert
3. Klik `Verwijderen` → `nieuwsDB.archive(id)` (sets archived=true)
4. Modal sluit + row krijgt `data-news-archived="1"`
5. Met `Gearchiveerd`-toggle UIT: row verdwijnt uit tabel
6. Close-ways: X / Escape / Overlay ✅

## Restore-flow (gearchiveerde items)

1. Zet `Gearchiveerd`-toggle AAN → tabel toont alleen archived items
2. Per row: actie-cel toont `Herstel` (`btn-outline.hr-restore-btn`) BOVEN trash (`.news-purge-btn`)
3. Klik `Herstel` → `nieuwsDB.restore(id)` direct (geen modal — huisstijl-conform)
4. Row verdwijnt uit archived-view

## Permanent-delete-flow (gearchiveerde items)

1. Klik `.news-purge-btn` op gearchiveerde rij → `#news-purge-modal` opent
2. Slider-confirm pattern: sleep tot 100% → `Definitief verwijderen` activeert
3. Klik → hard DELETE uit Supabase + Storage cleanup
4. Modal sluit + row verdwijnt
5. Close-ways: X / Escape / Overlay ✅

## Search

- Live-filter via `input`-event op `#news-search-input`
- Filtert op alle visible kolom-teksten (titel)
- Verbergt non-matching rows via CSS display:none

## Gearchiveerd-toggle

- Aan: toon alleen `archived=true` records (purge-mode)
- Uit (default): toon alleen `archived=false` records (active-mode)

## Kolommen-toggle

- Klik `#columns-menu-btn` → popover met 3 toggles (Titel/Status/Aanmaakdatum)
- Default: alle ✓ aan
- Uit-toggle → kolom verbergt

## Sort

- Per kolom (`th.th-sort`): klik header → dropdown opent met:
  - ↑ Asc (button `.th-sort-opt`)
  - ↓ Desc
  - ∅ Hide
- Sort triggert tabel-rerender

## Schema events

- `besa:nieuws-updated` event op window bij mutaties
- Push naar `public.nieuws` via PostgREST
- Auth-error: handled via `besa-sync-reporter.js` + `besaHandleAuthFailure`
