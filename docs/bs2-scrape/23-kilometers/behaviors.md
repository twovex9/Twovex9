# Module 23 — Kilometers — BEHAVIORS

## Add-flow (BS1 superset)

1. Klik `⊕ Toevoegen` (#km-add-open-btn) → `#km-add-choice-modal` opent
2. Kies type:
   - **Handmatig** → `#km-add-manual-modal` opent (form: medewerker / datum / kilometers / beschrijving)
   - **Kantoor-route** → `#km-add-kantoor-modal` opent (form: medewerker / datum / route-template)
3. Submit form → INSERT in `public.kilometer_declaraties`
4. Close-ways alle 3 modals (na Bug #54 fix): X ✅ Escape ✅ Overlay ✅

## Edit-flow

1. Klik op rij → `#km-edit-modal` opent
2. Edit form-velden
3. Submit → UPDATE record
4. Close-ways: X ✅ Escape ✅ Overlay ✅

## Purge-flow

1. Trash-icon op rij → `#km-purge-modal` opent (slider-confirm)
2. Slider tot 100% → bevestig → hard DELETE
3. Close-ways: X ✅ Escape ✅ Overlay ✅

## Filters

- Search (#km-search) live filter
- Maand-select (#km-filter-maand) - "+ Maand" label
- Jaar-select (#km-filter-jaar) - "+ Jaar" label  
- Reset-knop (#km-filter-reset) wist filters

## Export (BS1 extra)

- Klik #km-export-btn → CSV-download

## Stats

- 3 stat-cards real-time updaten op basis van filtered rows
- Totale declaraties / afstand / vergoeding

## Events

- `ff:kilometers-updated` event op window
