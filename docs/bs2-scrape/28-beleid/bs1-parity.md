# Module 28 — Beleid — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 ("Documenten" / "Beleidsdocumenten") | ✅ | ✅ | ✅ functioneel identiek |
| Kolommen-kiezer | ✅ | ✅ | ✅ |
| Add-knop (Document uploaden / Beleidsdocument toevoegen) | ✅ | ✅ | ✅ |
| Reset-knop | ✅ | ✅ | ✅ |
| Search-toolbar | ✅ | ✅ | ✅ |
| Gearchiveerd-toggle (BS1 extra) | ❌ | ✅ | BS1+ |
| Tabel-kolom Naam | ✅ | ✅ | ✅ |
| Tabel-kolom Nr. (BS1 extra) | ❌ | ✅ | BS1+ |
| Tabel-kolom Type (BS1 extra) | ❌ | ✅ | BS1+ |
| Tabel-kolom Uploaddatum | ✅ | ✅ | ✅ |
| Tabel-kolom Laatst gewijzigd | ✅ | ✅ | ✅ |
| Tabel-kolom Bestand (BS1 extra) | ❌ | ✅ | BS1+ |
| Tabel-kolom Acties (archive/restore/purge) | ✅ | ✅ | ✅ |
| Add/Edit modal | ✅ | ✅ | ✅ |
| Archive flow (slider) | ✅ | ✅ | ✅ |
| Restore flow (direct) | ✅ | ✅ | ✅ |
| Purge flow (slider) | ✅ | ✅ | ✅ |
| File-upload (PDF/Word) → Storage | ✅ | ✅ | ✅ |
| Pagination | ✅ | ✅ | ✅ |
| Rijen per pagina dropdown | ✅ | ✅ | ✅ |
| 3 modals × 3 close-ways (X / Escape / Overlay) | n.v.t. | ✅ na Bug #63 fix | ✅ |
| Records-count | 25 | 25 (na Bug #62 import) | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #62 (data) — 10 missing records BS1
- BS1 had volgnummer 9-23 (15 records); BS2 heeft volgnummer 1-23 + H01 + H03 (25 records)
- 10 records ontbraken: 01-08 + H01 (Handboek) + H03 (Personeelsbeleid)
- **Fix**: SQL INSERT van 10 records met type-classificatie (protocol/beleid/richtlijn/werkwijze/handboek)

### Bug #63 (UI) — 3 modals × 2 missing close-ways
- `beleid-add-modal` + `beleid-archive-modal` + `beleid-purge-modal` misten Escape + Overlay-click close-ways
- **Fix in beleid.js**: globale `initGlobalCloseForBeleidModals()`:
  - Globale Escape keydown-handler (modal-type-aware: display:none of hidden-attr)
  - Defensieve overlay-click handler per modal

## Conclusie

Module 28 is **100% functionele pariteit** met BS2 na Bug #62 + #63 fix.
BS1 superset: extra `Nr.` / `Type` / `Bestand`-kolommen + `Gearchiveerd`-toggle.
