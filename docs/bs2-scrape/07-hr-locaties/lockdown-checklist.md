# Module 07 — HR Locaties LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 07 HR Locaties (locaties.html + locatie-detail.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bevindingen vóór CLEAN RUNS**:
- BS1 locaties.html + locatie-detail.html bestonden al volledig
- locatiesDB compleet CRUD-API
- **Data-pariteit fix**: BS1 had 23 records (12 duplicates + 1 "test" garbage). Cleanup → 11 records = match BS2.

**2 bugs gefixt via PR #81**:
- #23: locaties.js trash slider Escape close (generic Escape voor topmost)
- #24: locatie-detail.js ••• menu was inert → popover-menu met Archiveren + Definitief verwijderen + outside-click/Escape close

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/locations`:
- 4 kolommen: Naam / Adres / Aanmaakdatum / Laatst gewijzigd
- 11 records totaal (BS2 toont "15 of 11 total" = 11 records)
- "Locatie toevoegen" button
- "Geen locatie toegewezen: 14" badge

- [x] A1-A10. Alle BS2 hardcore items getest

## B. BS1-test hardcore (10/10 ✅)

Live test op locaties.html + locatie-detail.html na PR #81.

- [x] B1-B3. Navigate + scroll
- [x] B4. Klik élke knop
- [x] B5. Modal × 3 close-ways:
  - Locatie toevoegen: X ✅ Escape ✅ Overlay ✅
  - Trash slider: Escape ✅ (Bug #23 fix)
  - ••• menu detail: outside-click ✅ Escape ✅ (Bug #24 fix)
- [x] B6. Filter/toggle: Gearchiveerd switch
- [x] B7. E2E: locatiesDB.add/update/archive/restore/delete allen werken
- [x] B8. Detail-page volledig getest
- [x] B9. Console: 0 app-errors
- [x] B10. Visuele match BS2 ↔ BS1: identiek

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1-C5. Schema verified (locaties tabel, RLS, indices, triggers)
- [x] C6. Data-pariteit BS1=BS2=11 ✅ (na cleanup 12 duplicates)
- [x] C7. Content spot-check: naam/adres match
- [x] C8. CRUD complete
- [x] C9. besa:locaties-updated event
- [x] C10. parity.md: 100%

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅)

### CLEAN RUN #1 (na PR #81)
- ✅ Lijst-page: 11 records, scroll, add modal × 3 close, trash Escape, CRUD complete
- ✅ Detail-page: ••• menu opens met Archiveren + Definitief verwijderen, outside-click + Escape close, save flow persisteert, back-btn correct

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek aan RUN #1 alle stappen pass

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 2 bugs gefixt: PR #81 (#23 + #24)
- Data-pariteit BS1=BS2=11 ✅
- Console errors 0

📌 DPA: Niet blokkerend voor Module 08 (Fase A).
