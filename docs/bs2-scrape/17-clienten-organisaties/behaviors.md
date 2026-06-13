# Module 17 — Cliënten Organisaties — BEHAVIORS

## Add-flow
1. Klik `#org-add-btn` → `#org-add-modal` opent
2. Veld: Naam (text required)
3. Submit → INSERT in `public.organisaties`
4. Close-ways: X (`#org-add-close`) ✅ / Escape ✅ / Overlay ✅

## Archive-flow
1. Klik trash op rij → `#org-archive-modal` opent
2. Slider tot 100% → bevestig → `organisatiesDB.archive(id)`
3. Close-ways: X (`#org-ar-close`) ✅ / Escape ✅ / Overlay ✅

## Restore-flow
1. Gearchiveerd-toggle aan → archived rows
2. Herstel-knop direct (geen modal)

## Purge-flow
1. Klik trash op archived rij → `#org-purge-modal` opent
2. Slider-confirm → hard DELETE
3. Close-ways: X (`#org-purge-close`) ✅ / Escape ✅ / Overlay ✅

## Search
- Live filter via `#org-search` (case-insensitive)

## Kolommen
- 1 toggle (Naam)

## Events
- `ff:organisaties-updated` event op window
