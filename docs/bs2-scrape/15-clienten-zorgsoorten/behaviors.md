# Module 15 — Cliënten Zorgsoorten — BEHAVIORS

## Add-flow

1. Klik `#zs-add-btn` → `#zs-add-modal` opent
2. Velden: Naam (text required) + Tarieftype (select: uur/dag/week)
3. Submit `#zs-add-submit` → INSERT in `public.zorgsoorten` via zorgsoortenDB
4. Modal sluit + tabel refresht
5. Close-ways: X (`#zs-add-close`) ✅ / Escape ✅ / Overlay ✅

## Archive-flow

1. Klik trash-icon (`.zs-archive-btn`) op rij → `#zs-archive-modal` opent
2. Slider-confirm pattern: sleep tot 100% → bevestig-knop activeert
3. Klik bevestig → `zorgsoortenDB.archive(id)` (sets archived=true)
4. Modal sluit + tabel refresht
5. Close-ways: X (`#zs-ar-close`) ✅ / Escape ✅ / Overlay ✅

## Restore-flow (archived items)

1. Zet Gearchiveerd-toggle aan
2. Per row: Herstel-knop (`.btn-outline.hr-restore-btn`) boven trash
3. Klik Herstel → `zorgsoortenDB.restore(id)` direct, geen modal

## Purge-flow

1. Klik trash op archived rij → `#zs-purge-modal` opent
2. Slider-confirm pattern
3. Klik bevestig → hard DELETE uit Supabase
4. Close-ways: X (`#zs-purge-close`) ✅ / Escape ✅ / Overlay ✅

## Search

- Live filter op `#zs-search` (case-insensitive)
- Filtert op naam

## Gearchiveerd-toggle

- `#zs-archived-toggle` → swap actief/archived view

## Kolommen-toggle

- Klik `#zs-columns-menu-btn` → floating panel met 2 toggles (Naam, Tarieftype)

## Events

- `besa:zorgsoorten-updated` event op window bij mutaties
- Schrijven naar Supabase via PostgREST
