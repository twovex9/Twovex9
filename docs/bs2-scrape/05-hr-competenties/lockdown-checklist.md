# Module 05 — HR Competenties LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 05 HR Competenties (competenties.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Gestart**: 2026-05-14
**Voltooid**: 2026-05-14
**Override gegeven**: niet gegeven

**Bevindingen vóór CLEAN RUNS**:
- BS1 `competenties.html` bestond al volledig + competentiesDB compleet CRUD
- **Data-pariteit fix**: BS1 had 3 records (1 garbage "[object Object]" + 1 "doorzettingsvermogen" niet in BS2 + 1 "Stressbestendig"). Cleanup naar 1 record matchen BS2.

**1 bug gefixt via PR #75**:
- #19: Escape sluit alleen `cp-purge-modal`, niet andere modals (comp-add/comp-delete/comp-edit). Generic Escape-handler voor topmost open modal.

Override-teksten:
- `LOCKDOWN OVERRIDE GO`
- `Ja, ga door zonder volledige hardcore-test`
- `User-override: doorgaan naar volgende module`

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/competencies`:
- 4 kolommen: Naam / Medewerkers / Aanmaakdatum / Laatst gewijzigd
- 1 actieve competentie: "Stressbestendig" (0 medewerkers)
- "Competentie toevoegen" button

- [x] A1-A2. Scroll
- [x] A3. Buttons: Competentie toevoegen, sort headers
- [x] A4. Sort dropdown per header (Asc/Desc/Hide)
- [x] A5. Modal × 3 close-ways
- [x] A6. Tabs n.v.t. (geen tabs op deze page)
- [x] A7. Links n.v.t.
- [x] A8. Cell/row-click
- [x] A9. Keyboard Escape
- [x] A10. Network + console: 0 errors

## B. BS1-test hardcore (10/10 ✅)

Live test op `https://besa-suite.vercel.app/competenties.html` na PR #75.

- [x] B1. Navigate BS1: "Competenties — HR"
- [x] B2-B3. Scroll OK
- [x] B4. Klik élke knop: 6 page-buttons + sort + trash + edit
- [x] B5. Modal × 3 close-ways op alle modals:
  - Competentie toevoegen: X ✅ Escape ✅ Overlay ✅
  - Competentie archiveren (trash slider): X ✅ Escape ✅ (Bug #19 fix) Overlay ✅
- [x] B6. Filter/toggle: Gearchiveerd switch ✅
- [x] B7. E2E flow: competentiesDB.add/update/archive/restore/delete allen werken
- [x] B8. Sub-pages n.v.t.
- [x] B9. Console-errors: 0 app-errors
- [x] B10. Visuele match BS2 ↔ BS1: kolommen identiek

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `competenties` (id uuid PK)
- [x] C2. Kolommen: id/naam/archived/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Indices: naam
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data-volume-pariteit: BS2 = 1 "Stressbestendig", BS1 = 1 "Stressbestendig" ✅ 100% pariteit (na cleanup van 2 garbage records)
- [x] C7. Content spot-check: naam match
- [x] C8. CRUD-cycle: add/update/archive/restore/delete allen werken
- [x] C9. Realtime: `besa:competenties-updated` event
- [x] C10. parity.md: 100%

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ — ZONDER fix tussendoor)

### CLEAN RUN #1 (vers, na PR #75)
- ✅ Scroll
- ✅ 6 page-buttons
- ✅ Add modal × 3 close
- ✅ Trash slider × 3 close (Bug #19 fix verified)
- ✅ CRUD all 5 ops
- ✅ A11y: 3/3 icon-only buttons aria-label (100%)
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Scroll
- ✅ Add modal × 3 close
- ✅ Trash slider × 3 close (Escape works permanently)
- ✅ CRUD all 5 ops
- ✅ A11y: 3/3 (100%)
- ✅ Console = 0

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 1 bug gefixt: PR #75 (Escape voor trash modal)
- Data-pariteit 100%: 1 record beide kanten
- Console errors 0

**Module 05 status**: 🔒 LOCKDOWN 30/30 + 2 CLEAN RUNS ✅ — wacht op override.

📌 DPA-herinnering: Niet blokkerend voor Module 06 (Fase A).
