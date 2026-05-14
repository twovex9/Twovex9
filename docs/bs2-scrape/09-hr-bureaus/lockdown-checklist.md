# Module 09 — HR Bureau's LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 09 HR Bureau's (bureaus.html + bureau-detail.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bevindingen vóór CLEAN RUNS**:
- BS1 bureaus.html + bureau-detail.html bestonden al volledig
- **Data-pariteit fix**: BS1 had 5 records (4 actief + 1 "test" archived garbage). Cleanup → 4 records = match BS2.

**2 bugs gefixt via PR #85**:
- #28: bureaus.js trash slider Escape close (generic Escape voor topmost)
- #29: bureau-detail.js ••• menu was inert → popover-menu met Archiveren + Definitief verwijderen + outside-click/Escape close

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/agencies`:
- 1 kolom: Naam
- 4 records: Zorgkracht Direct / BLND / Optimum Flex / Level Up
- "Bureau toevoegen" button

- [x] A1-A10. Alle BS2 hardcore items getest

## B. BS1-test hardcore (10/10 ✅)

Live test op bureaus.html + bureau-detail.html na PR #85.

- [x] B1-B3. Navigate + scroll
- [x] B4. Klik élke knop
- [x] B5. Modal × 3 close-ways:
  - Bureau toevoegen: X ✅ Escape ✅ Overlay ✅
  - Trash slider: Escape ✅ (Bug #28 fix)
  - ••• menu detail: outside-click ✅ Escape ✅ (Bug #29 fix)
- [x] B6. Filter/toggle: Gearchiveerd switch
- [x] B7. E2E: bureausDB.add/update/archive/restore/delete allen werken
- [x] B8. Detail-page volledig getest (save flow + back-btn)
- [x] B9. Console: 0 app-errors
- [x] B10. Visuele match BS2 ↔ BS1: identiek

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `bureaus` (id uuid PK)
- [x] C2. Kolommen: id/naam/uurtarief/fee/archived
- [x] C3. RLS: auth-only
- [x] C4. Indices: naam
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data-pariteit BS1=BS2=4 ✅ (cleanup 1 garbage)
- [x] C7. Content spot-check: 4 namen identiek
- [x] C8. CRUD complete
- [x] C9. besa:bureaus-updated event
- [x] C10. parity.md: 100%

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅)

### CLEAN RUN #1 (na PR #85)
- ✅ Lijst-page: 4 records, scroll, add modal × 3 close, trash Escape, CRUD complete
- ✅ Detail-page: ••• menu opens met Archiveren + Definitief verwijderen, outside-click + Escape close, save flow persisteert (BLND → BLND-CR1 → BLND), back-btn correct

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek aan RUN #1 alle pass

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 2 bugs gefixt: PR #85 (#28 + #29)
- Data-pariteit BS1=BS2=4 ✅
- Console errors 0

📌 DPA: Niet blokkerend voor Module 10 (Fase A).
