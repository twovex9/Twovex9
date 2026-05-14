# Module 28 — Beleid — BEHAVIORS

## Search & filters
- Zoeken (`#beleid-search`): live filter op naam/type/volgnummer (case-insensitive)
- Gearchiveerd-toggle (`.switch--yellow`): switcht tussen actieve en gearchiveerde records
- Reset-knop: wist zoeken + zet archived-toggle uit + reset page=1

## Pagination
- Rijen per pagina: 10/15/30/50 (default 30)
- First/Prev/Next/Last navigatie via «/‹/›/»
- "X-Y van Z" range-label + "Pagina X van Y" page-label

## Kolommen-kiezer
- Klik `.btn-outline.columns-btn` → toggle paneel zichtbaarheid
- Per kolom: aan/uit toggle (skipToggle=true voor "Naam")
- Voorkeuren persistent in localStorage (`beleid_columns_v1`)

## Add/Edit modal (`beleid-add-modal`)
- Klik `+ Beleidsdocument toevoegen` (`#beleid-add-btn`) → modal opent (style.display = "flex")
- Klik op naam-link in tabel → edit-modal opent met data pre-populated
- Form-velden:
  - Volgnummer (optional, number ≥ 1)
  - Naam (required)
  - Type (optional, free text bv. protocol/beleid/richtlijn)
  - Bestand (optional file-upload, PDF/Word)
- Submit → `beleidsdocumentenDB.add(payload)` of `.update(id, payload)`
- File-upload via `readFileAsDataUrl()` → data-URL → wordt automatisch naar Storage geüpload door data-laag

## Archive flow (`beleid-archive-modal`)
- Klik trash-icoon op actieve row → slider-modal opent
- Slider 0→100% → confirm-button enabled
- Confirm → `beleidsdocumentenDB.archive(id)` → row krijgt `archived=true`
- Verschijnt onder Gearchiveerd-toggle aan

## Restore flow (direct, geen modal)
- Klik `Herstel`-button bij gearchiveerde row → `beleidsdocumentenDB.restore(id)` direct
- showActionFeedback("restored", ...)

## Purge flow (`beleid-purge-modal`)
- Klik trash-icoon op gearchiveerde row → slider-modal opent
- Slider 0→100% → confirm-button enabled
- Confirm → `beleidsdocumentenDB.delete(id)` → row permanent verwijderd + storage file gewist

## Modal close-ways (na Bug #63 fix)
- X-button: alle 3 modals
- Annuleren-button: alle 3 modals (lokale handler in beleid.js)
- **Escape**: globale handler (Bug #63 fix)
- **Overlay-click**: per-modal handler (Bug #63 fix)
- 9/9 close-ways werkend ✅

## Events
- `besa:beleidsdocumenten-updated` → re-render trigger
