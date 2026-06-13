# Module 06 — HR Opleidingen LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 06 HR Opleidingen (opleidingen.html + opleiding-detail.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Gestart**: 2026-05-14
**Voltooid**: 2026-05-14
**Override gegeven**: niet gegeven

**Bevindingen vóór CLEAN RUNS**:
- BS1 opleidingen.html + opleiding-detail.html bestonden al volledig
- opleidingenDB compleet CRUD-API: bootstrap/refresh/add/update/archive/restore/delete/getAllSync
- **Data-pariteit fix**: BS1 had 70 records, BS2 = 69. Cleanup "Preventiemedewerker" duplicate → 69=69 100% match.

**2 bugs gefixt via PR #79**:
- #21: opleidingen.js trash slider modal sluit niet via Escape (alleen op-purge had handler). Generic Escape voor topmost open modal.
- #22: opleiding-detail.html ••• menu was inert (geen handler). Popover-menu met Archiveren + Definitief verwijderen + outside-click/Escape close.

Override-teksten:
- `LOCKDOWN OVERRIDE GO`
- `Ja, ga door zonder volledige hardcore-test`
- `User-override: doorgaan naar volgende module`

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/certifications`:
- 4 kolommen: Naam / SKJ / Aanmaakdatum / Laatst gewijzigd
- 69 records totaal (50 per page, paginering)
- "Opleiding toevoegen" button
- Gearchiveerd toggle

- [x] A1-A2. Scroll
- [x] A3. Klik élke knop
- [x] A4. Sort dropdown per kolom + pagination select
- [x] A5. Modal × 3 close-ways
- [x] A6. Tabs n.v.t.
- [x] A7. Pagination links
- [x] A8. Row-click → detail-page
- [x] A9. Keyboard Escape
- [x] A10. Network + console: 0 errors

## B. BS1-test hardcore (10/10 ✅)

Live test na PR #79.

- [x] B1. Navigate opleidingen.html: "Opleidingen — HR"
- [x] B2-B3. Scroll OK
- [x] B4. Klik élke knop: + Opleiding toevoegen, sort headers, row trash + edit-pencil
- [x] B5. Modal × 3 close-ways:
  - Opleiding toevoegen: X ✅ Escape ✅ Overlay ✅
  - Opleiding archiveren (trash slider): Escape ✅ (Bug #21 fix verified)
  - ••• menu detail-page: outside-click ✅ Escape ✅ (Bug #22 fix verified)
- [x] B6. Filter/toggle: Search "MBO4" → 14 visible, Gearchiveerd switch werkt
- [x] B7. E2E: opleidingenDB.add/update/archive/restore/delete allen werken
- [x] B8. Detail-page: opleiding-detail.html ••• menu + Save flow + Tab switching + Back btn
- [x] B9. Console: 0 app-errors
- [x] B10. Visuele match BS2 ↔ BS1: identiek

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `opleidingen` (id uuid PK)
- [x] C2. Kolommen: id/naam/skj/archived/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Indices: naam
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data-volume-pariteit: BS1=BS2=69 ✅ (na cleanup)
- [x] C7. Content spot-check: naam/skj match
- [x] C8. CRUD-cycle: alle 5 ops werken
- [x] C9. Realtime: `ff:opleidingen-updated` event
- [x] C10. parity.md: 100%

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ — ZONDER fix tussendoor)

### CLEAN RUN #1 (vers, na PR #79)
**opleidingen.html**:
- ✅ Scroll, 69 records, 15 rendered (pagination)
- ✅ Add modal × 3 close-ways (X/Escape/Overlay)
- ✅ Trash slider × Escape (Bug #21 fix verified)
- ✅ CRUD: add 69→70, update name, archive, restore, delete 70→69
- ✅ Search "MBO4" → 14 visible
- ✅ Kolommen 4 toggles, Sort menu (Asc/Desc/Hide)

**opleiding-detail.html**:
- ✅ ••• menu opens met Archiveren + Definitief verwijderen (Bug #22 fix)
- ✅ Outside-click + Escape sluiten menu
- ✅ Save flow persisteert + revert
- ✅ Tab switch Details ↔ Medewerkers
- ✅ Back-btn href = "opleidingen.html"
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor, identiek)
- ✅ Alle stappen pass identiek aan RUN #1

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 2 bugs gefixt: PR #79 (#21 + #22)
- Data-pariteit BS1=BS2=69 ✅
- Console errors 0

**Module 06 status**: 🔒 LOCKDOWN 30/30 + 2 CLEAN RUNS ✅ — wacht op override.

📌 DPA-herinnering: Niet blokkerend voor Module 07 (Fase A).
