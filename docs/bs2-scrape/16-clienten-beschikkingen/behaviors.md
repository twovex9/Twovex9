# Module 16 — Beschikkingen — BEHAVIORS

## Add-flow
1. Klik `#besc-add-open` → `#besc-add-modal` opent
2. Form: cliënt / naam / zorgsoort / fase / periode / tarief / decl methode
3. Submit `#besc-add-form` → INSERT in `public.beschikkingen`
4. Close-ways (na Bug #44 fix): X (`#besc-add-x`) ✅ / Escape ✅ / Overlay ✅

## Export-flow
1. Klik `#besc-export-btn` → `#besc-export-modal` opent
2. Kies kolommen / formaat → bevestig → CSV/Excel download
3. Close-ways (na Bug #45 fix): X (`#besc-export-x`) ✅ / Escape ✅ / Overlay ✅

## Purge-flow
1. Klik trash op rij → `#besc-purge-modal` opent (modal-overlay--confirm + slider)
2. Slider → bevestig → hard DELETE
3. Close-ways: X ✅ / Escape ✅ (Bug #44 globale Escape-handler) / Overlay ✅

## Filters
- 4 toggle-checkboxes: Gearchiveerd / Verloopt binnen 60d / Heeft te declareren LM / Heeft nog niet gedeclareerd
- 4 dropdowns: Zorgsoort / Fase (Bug #46 fix — proper case) / Status (betaling) / Declaratie methode
- Reset-knop wist alle filters

## Search
- Live filter via `#besc-search` op cliënt-naam / beschikking-naam

## Sort
- Per kolom: th-click → toggle Asc/Desc

## Events
- `ff:beschikking-updated` event op window bij mutaties
