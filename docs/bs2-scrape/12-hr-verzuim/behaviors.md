# Module 12 — HR Verzuim — BEHAVIORS

## Tab switch (Lange ↔ Korte termijn)

- Klik op `Korte termijn` → tabel filtert op `type='kort'`, badge wordt actief
- Klik op `Lange termijn` → tabel filtert op `type='lang'` (default)
- Geen URL-update bij tab-switch
- BS1 telling: lang=11, kort=3 (geverifieerd 2026-05-14)

## Search

- Live filter op tbody bij `input`-event
- Filtert op alle zichtbare kolom-teksten (medewerker / beschrijving / status)
- Geen debounce zichtbaar — direct filter

## Kolom-zichtbaarheid

- Klik `Kolommen` → floating panel met 7 toggles
- Default: alle kolommen ✓ aan
- Toggle uit/aan → kolom verbergt/verschijnt direct
- State niet persistent over reloads (lokaal of UI-only)

## Edit-flow (verzuim bewerken vanaf overzicht)

1. Klik edit-icon in actie-kolom rij
2. Modal `#vz-edit-modal` opent (`.emp-verzuim-modal-overlay` style)
3. Velden invullen: medewerker / type / eerste ziektedag / verwachte terugkeer / werkelijke terugkeer / beschrijving / status
4. Klik `Opslaan` → save naar Supabase via verzuimDB.pushType
5. Modal sluit + tabel refresht
6. **3 sluit-manieren** ALLE WERKEN:
   - X-knop (`#vz-edit-close-btn`) ✅
   - Escape-toets ✅
   - Klik op overlay (buiten modal-card) ✅

## Delete-flow

1. Klik delete-icon (trash SVG) in actie-kolom rij
2. Modal `#vz-delete-modal` opent (`.modal-overlay--confirm` met slider-confirm)
3. Slider sleepen tot 100% (blauw vol) → `Verwijderen`-knop activeert
4. Klik `Verwijderen` → hard delete uit Supabase
5. Modal sluit + tabel refresht
6. **3 sluit-manieren** ALLE WERKEN:
   - X-knop (`#vz-delete-close-btn`) ✅
   - Escape-toets ✅
   - Klik op overlay ✅
7. Slider niet 100% → confirm-knop disabled (huisstijl-conform)

## Verzuim toevoegen

- **Niet vanaf `/verzuim.html` overzicht** (zelfde als BS2)
- Aanmaken via medewerker-detail page → Verzuim-tab
- Module 27 (medewerker-detail) zal de toevoeg-flow dekken

## Sort kolommen

- BS1 huidig: **geen** klikbare sorteer-headers (geen `.th-sort` class)
- BS2: ook geen visuele sort-pijlen zichtbaar op huidig screenshot
- Geen GAP

## Audit & events

- `besa:verzuim-updated` event op window bij verzuimDB-mutaties (push)
- Schrijven naar Supabase tabel `medewerker_verzuim_perioden`
- Type-veld: `'kort'` of `'lang'`
- Geen aparte audit-log entries voor verzuim mutaties (binnen scope van module 12)

## Network

- Push naar Supabase via PostgREST (`/rest/v1/medewerker_verzuim_perioden`)
- Bij auth-error: handled door `besa-sync-reporter.js` + `besaHandleAuthFailure`
