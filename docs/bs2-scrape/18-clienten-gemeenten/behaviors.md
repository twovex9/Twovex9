# Module 18 — Cliënten Gemeenten — BEHAVIORS

## Add-flow
1. Klik `#gem-add-btn` → `#gem-add-modal` opent
2. Veld: Naam (text required)
3. Submit → INSERT in `public.gemeenten`
4. Close-ways: X (`#gem-add-close`) ✅ / Escape ✅ / Overlay ✅

## Archive-flow
1. Klik trash op rij → `#gem-archive-modal` (slider)
2. Slider → bevestig → `gemeentenDB.archive(id)`
3. Close-ways: X (`#gem-ar-close`) ✅ / Escape ✅ / Overlay ✅

## Restore-flow
1. Gearchiveerd-toggle aan → archived rows
2. Herstel-knop direct

## Purge-flow
1. Trash op archived rij → `#gem-purge-modal` (slider)
2. Slider → bevestig → hard DELETE
3. Close-ways: X (`#gem-purge-close`) ✅ / Escape ✅ / Overlay ✅

## Search
- Live filter via `#gem-search` (case-insensitive)

## Kolommen
- 1 toggle (Naam)

## Events
- `besa:gemeenten-updated` event op window
