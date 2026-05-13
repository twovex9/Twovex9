# Item 51 — Sprint 9: Beleid documenten (BS2 parity)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S9 in `../v2-master-plan.md`
**BS2 ref**: `/documents`

## Wat is gedaan

### BS2 deep walk bevinding

BS2 `/documents` toont:
- Title: "Documenten"
- Top right: **Kolommen** knop + **Document uploaden** knop
- Search input + **Reset** knop (X)
- Table: Naam, Uploaddatum, Laatst gewijzigd, Acties (eye/edit/trash)
- Per-row checkbox (multi-select)
- 25 docs, paginated

### Gap-analyse BS1 ↔ BS2

| Feature | BS2 | BS1 vóór S9 | BS1 ná S9 |
|---|---|---|---|
| Document upload (Storage) | ✅ | ✅ (`beleidsdocumenten` bucket) | ✅ |
| Document delete | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ |
| **Reset-knop** | ✅ | ❌ | ✅ |
| **Kolommen-kiezer** | ✅ | ❌ | ✅ |
| Volgnummer-veld | ❌ | ✅ (BS1-extra) | ✅ |
| Type-veld | ❌ | ✅ (BS1-extra) | ✅ |
| Multi-select bulk delete | ✅ | ❌ | ❌ (defer v3) |
| Eye-icoon view inline | ✅ | ❌ (eigen "Bestand" kolom met link) | ❌ (defer v3) |

**Conclusie**: BS1 had AL upload via Supabase Storage (`beleidsdocumenten` bucket) — geen migration nodig. Alleen 2 UX-features ontbreken: Reset + Kolommen.

### NIET meegenomen (defer v3)

- Multi-select bulk-delete — out of 3u scope, gewone per-row delete werkt
- Eye-icoon inline view — BS1 toont al direct download-link in "Bestand" kolom, BS2 toont overlay-viewer (grote feature, niet kritiek)

### Implementatie

#### `beleid.html`

- Nieuwe **Kolommen-knop** (`.columns-dropdown` + `.columns-btn`) in `.header-actions` voor "+ Beleidsdocument toevoegen" knop
- Nieuwe **Reset-knop** (`.taken-reset-btn` reuse uit S8) naast search-input

#### `beleid.js`

Nieuwe sectie "Sprint 9 / S9":
- `BELEID_COLUMN_CONFIG` — 6 kolommen (volgnummer/naam/type/uploaddatum/laatst-gewijzigd/bestand)
- `readBeleidColumnPrefs()` / `writeBeleidColumnPrefs()` — localStorage cache (`beleid_columns_v1`)
- `setBeleidColumnVisible(colId, visible)` — toggle `.col-hidden` op alle cellen met `data-col="..."`
- `applyBeleidColumnVisibility()` — pas alle prefs toe
- `buildBeleidColumnsPanel()` — render checkboxes
- `wireBeleidColumnsPanel()` — open/close dropdown logic

Wire-up:
- Reset-knop → wist search + showArchived + toast
- Kolommen-kiezer → `buildBeleidColumnsPanel()` + `wireBeleidColumnsPanel()` in init

Reuse bestaande CSS:
- `.columns-dropdown`, `.columns-btn`, `.columns-panel`, `.columns-list`, `.column-toggle`, `.column-toggle-check`, `.column-toggle-label`, `.col-hidden` (al in `styles.css` voor planning/taken/medewerker pages)
- `.taken-reset-btn` (uit S8)

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅)
- [ ] Vercel deploy slaagt
- [ ] `/beleid.html` toont 2 knoppen rechts in header: Kolommen + Beleidsdocument toevoegen
- [ ] Toolbar toont Reset-knop naast search-input
- [ ] Klik Reset → search-input leeg + archief uit + toast
- [ ] Klik Kolommen → dropdown met 5 toggles (naam is skipToggle)
- [ ] Uncheck "Type" → kolom verdwijnt in tabel + persist over reload
- [ ] Document-upload werkt onveranderd (bestaand)

## Acceptance (master-plan S9)

- ✅ BS2 deep walk uitgevoerd op `/documents`
- ✅ Bestaande document-import functionaliteit gevalideerd (al aanwezig sinds Phase 4)
- ✅ Reset + Kolommen UX-features toegevoegd

## Status update bij merge

Bij merge: master-plan S9 → ✅ DONE + PR-nummer. Direct start Sprint 10 (BS2 data resync via JS-snippet, 3u + user-actie).
