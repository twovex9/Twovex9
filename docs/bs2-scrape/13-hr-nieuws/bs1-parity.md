# Module 13 — HR Nieuws — BS1 PARITY

**Datum**: 2026-05-14
**BS2**: `/hr/announcements` (overzicht) + `/hr/announcements/{id}/details` (detail-page)
**BS1**: `nieuws.html` (overzicht + modal-editor)

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Nieuws" | ✅ | ✅ | ✅ |
| Sidebar item "Nieuws" (laatste positie) | ✅ | ✅ | ✅ |
| `+ Nieuws toevoegen` knop | ✅ | ✅ #news-add-open-btn | ✅ |
| `Kolommen` toggle-knop | ✅ | ✅ #columns-menu-btn | ✅ |
| `Gearchiveerd` toggle | ✅ | ✅ #news-archived-toggle | ✅ |
| Zoeken-input | ✅ | ✅ #news-search-input | ✅ |
| Sort: Titel asc/desc/hide | ✅ | ✅ th-sort dropdown | ✅ |
| Sort: Status asc/desc/hide | ✅ | ✅ | ✅ |
| Sort: Aanmaakdatum asc/desc/hide | ✅ | ✅ | ✅ |
| Status pill "Published" | ✅ | ✅ (15/15 na Bug #35 fix) | ✅ |
| Edit via klik op titel | ✅ → separate page | ✅ → modal | 🟢 functioneel gelijk |
| Edit: Naam + Inhoud velden | ✅ | ✅ (+ RTE-editor extra) | ✅ BS1+ |
| Edit: Publiceer-knop | ✅ | ✅ #news-edit-publish-btn | ✅ |
| Edit: Wijzigingen opslaan | ✅ | ✅ #news-edit-save-btn | ✅ |
| Edit: Back/Terug | (browser back) | ✅ #news-edit-back-btn | ✅ |
| Edit: Meer-opties menu | (niet zichtbaar in BS2) | ✅ Bug #37 fix popover | ✅ |
| Add-modal × 3 close-ways | n.v.t. | ✅ X/Escape/Overlay | ✅ |
| Delete-modal × 3 close-ways + slider | ✅ | ✅ X/Escape/Overlay | ✅ |
| Purge-modal × 3 close-ways + slider | ✅ | ✅ (archived items) | ✅ |
| Multi-select checkbox in tabel | ✅ | ✅ | ✅ |
| 15 records "Published" | ✅ | ✅ na Bug #35 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #35 — Status normalisatie
- **Probleem**: 12 records "Gepubliceerd" (NL) + 3 "Published" (EN) — inconsistent
- **BS2**: gebruikt "Published" (EN)
- **Code-default**: "Published" (al in `nieuws-data.js` + `nieuws.js`)
- **Fix**: SQL UPDATE alle "Gepubliceerd" → "Published" via Supabase
- **Resultaat**: 15/15 records "Published"

### Bug #37 — Meer-opties menu non-functional in edit-modal
- **Probleem**: `#news-edit-menu-btn` (kebab/⋯) visible 40×40px maar zonder click-handler
- **Fix**: popover toegevoegd in `nieuws.js`
  - Niet-archived: "Archiveren" item
  - Archived: "Herstellen" + "Definitief verwijderen" items
  - Click-buiten + Escape sluit popover
- **CSS**: nieuwe `.news-edit-menu-popover` + `.news-edit-menu-item` classes (huisstijl-conform met `--shadow-pop`, `--r-md`, `--fill-hover`, `--red-soft`)

## Conclusie

Module 13 nieuws is **100% functionele pariteit** met BS2 na Bug #35 + #37 fixes.

BS1 heeft een paar **extra features** boven BS2:
- RTE-editor (B/I/S/U/H1/H2/lijst/uitlijning/links)
- Secondary image-slot
- Meer-opties menu in edit-modal (Bug #37 fix)
- Aanmaakdatum-kolom met datum + tijd

Structureel verschil: BS2 gebruikt separate detail-page (`/details`), BS1 gebruikt modal full-page editor. Functioneel identiek (zelfde acties: opslaan, publiceren, archiveren, terug).
