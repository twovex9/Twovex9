# Module 28 — Beleid LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 28 Beleid (beleid.html, BS2 /documents)
**Lockdown-status**: 🟡 30/30 ✅ — **wacht op 2 HARDCORE CLEAN RUNS na user-merge**
**Voltooid**: 2026-05-14

**Bugs gefixt**:
- **#62** (data): 10 missing beleidsdocumenten records uit BS2 ingevoegd
- **#63** (UI): 3 beleid-modals × 2 missing close-ways (Escape + Overlay) defensieve fix in beleid.js

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /documents, h1 = "Documenten"
- [x] A2. Toolbar: Kolommen / Document uploaden / Reset
- [x] A3. Table cols: Naam / Uploaddatum / Laatst gewijzigd / Acties
- [x] A4. 25 records totaal (page 1: 09-23, page 2: 01-08 + H01 + H03)
- [x] A5. Pagination: 15 of 25 total, page 1 of 2
- [x] A6. Rows per page dropdown: 10/15/30/40/50
- [x] A7. Page navigation: « ‹ › »
- [x] A8. Sortering: descending op naam (volgnummer)
- [x] A9. Acties-kolom: download/edit-icon visible
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate beleid.html, h1 = "Beleidsdocumenten"
- [x] B2. Toolbar: Kolommen / + Beleidsdocument toevoegen / Reset / Gearchiveerd-toggle
- [x] B3. Table cols: NR. / NAAM / TYPE / UPLOADDATUM / LAATST GEWIJZIGD / BESTAND / Acties (BS1 superset)
- [x] B4. 25 records actief (na Bug #62 fix import)
- [x] B5. Search filtert correct op naam/type/volgnummer
- [x] B6. Reset wist search + archived-toggle
- [x] B7. Pagination: «/‹/›/» first/prev/next/last + rijen-per-pagina (10/15/30/50)
- [x] B8. 3 modals × 3 close-ways = 9/9 (na Bug #63 fix)
- [x] B9. Add/Edit modal: volgnummer/naam/type/bestand velden
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabel `public.beleidsdocumenten` (25 records na Bug #62 import)
- [x] C2. 11 kolommen: id/volgnummer/naam/type/uploaddatum/laatst_gewijzigd/archived/file_name/file_mime/file_size/storage_path
- [x] C3. RLS: auth-only via `to authenticated`
- [x] C4. Storage bucket `beleidsdocumenten` voor file-uploads (PDF/Word)
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. CRUD via beleidsdocumentenDB (add/update/archive/restore/delete)
- [x] C7. besa:beleidsdocumenten-updated event op window
- [x] C8. File-data flow: form-input → readFileAsDataUrl → data-laag → Storage upload + row INSERT met storage_path
- [x] C9. ID-pattern `bd_<volgnummer>` (+ `bd_H01`/`bd_H03` voor non-integer cases)
- [x] C10. parity.md: 100% functioneel + BS1 superset (Nr./Type/Bestand/Gearchiveerd-toggle)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor

**Test methode**: navigeer naar /beleid.html → controleer alle features.

### CLEAN RUN #1 (post-PR Bug #62 + #63 fix live) — WACHT OP MERGE

- [ ] BS1 beleid.html laadt met 25 records visible (alle volgnummer 1-23 + H01 + H03)
- [ ] Search filter werkt op naam/type/volgnummer
- [ ] Gearchiveerd-toggle: 0 archived records → leeg
- [ ] Reset-knop wist filters
- [ ] Pagination werkt (1 page bij 30/page)
- [ ] Rijen-per-pagina dropdown switch werkt
- [ ] Kolommen-kiezer: toggle Nr./Type/Uploaddatum/Laatst gewijzigd/Bestand
- [ ] `+ Beleidsdocument toevoegen` modal opent
- [ ] Bug #63 verified live — alle 3 modals × 3 close-ways = 9/9:
  - beleid-add-modal: X ✅ Escape ✅ Overlay ✅
  - beleid-archive-modal: X ✅ Escape ✅ Overlay ✅
  - beleid-purge-modal: X ✅ Escape ✅ Overlay ✅
- [ ] Klik op naam-link → edit-modal opent met data
- [ ] Klik trash-icoon → archive-modal opent
- [ ] Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- [ ] Identiek RUN #1 (geen fix tussendoor)
- [ ] 25 records visible
- [ ] 3 modals × 3 close-ways = 9/9
- [ ] Console = 0 app-errors

---

## Eindstand (na 2 CLEAN RUNS)
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor
- **9/9 modal × close-ways** (3 modals × 3 close-ways)
- Bug #62 (10 missing records) verified live
- Bug #63 (modals close-ways) verified live
- Console errors 0
- 25 records actief

📌 DPA: Niet blokkerend voor Module 29 (Audit).
