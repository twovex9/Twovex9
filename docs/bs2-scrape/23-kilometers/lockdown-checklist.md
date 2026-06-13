# Module 23 — Kilometers LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 23 Kilometers (kilometers.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt** in deze module:
- **#54** (UI): Escape close-way ontbrak voor 5 modals (km-add-choice/manual/kantoor/edit/purge). Fix via globale keydown-handler in kilometers.js.

**Bug gedocumenteerd** (niet blokkerend):
- **#53** (data): 16 BS2 records ontbreken in BS1 `kilometer_declaraties`. Phase B/D scope.

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/mileage/declarations`, h1 "Kilometer declaraties"
- [x] A2. Sidebar 1 item "Kilometer declaraties"
- [x] A3. 3 stat-cards header: Totale declaraties (16) / Totale afstand (5.004,54 km) / Totaalbedrag (€ 1.717,71)
- [x] A4. Toolbar: Search + Maand + Jaar + Kolommen
- [x] A5. 6 kolommen: Medewerker / Periode / Status / Ingediend op / Totale kilometers / Totale vergoeding
- [x] A6. Status pills: Niet ingediend (yellow) + Ingediend (green)
- [x] A7. 16 records, Page 1 of 2
- [x] A8. Pagination 15 default rows
- [x] A9. Multi-select checkbox header
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate kilometers.html, h1 "Kilometer declaraties", title "Kilometer declaraties — HR"
- [x] B2-B3. Scroll OK
- [x] B4. 3 stat-cards labels: Totale declaraties / Totale afstand / Totaalbedrag (Totale vergoeding)
- [x] B5. Add-choice modal × 3 close-ways: X ✅ Escape ✅ (Bug #54) Overlay ✅
- [x] B6. Add-manual modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- [x] B7. Add-kantoor modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- [x] B8. Edit-modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- [x] B9. Purge-modal × 3 close-ways + slider: X ✅ Escape ✅ Overlay ✅
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.kilometer_declaraties` (PK text)
- [x] C2. Velden: id/medewerker_id (uuid)/datum/type/beschrijving/locatie/dienst/kilometers/ingediend/ingediend_op/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Index op medewerker_id + datum
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 0 records BS1 vs 16 BS2 (Bug #53 doc — niet blokkerend)
- [x] C7. Content scope: BS1 toont alleen huidige user's records (filter)
- [x] C8. CRUD: add (choice→manual/kantoor) / edit / purge alle werken
- [x] C9. ff:kilometers-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset (Exporteren / Reset / 2 add-types)

## D. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

### CLEAN RUN #1 (post-PR #112, fresh)
- ✅ h1 "Kilometer declaraties", title "Kilometer declaraties — HR"
- ✅ 3 stat-cards (Totale declaraties / Totale afstand / Totaalbedrag)
- ✅ Top-nav active = "Kilometers"
- ✅ Scroll werkt
- ✅ Alle 5 modals × 3 close-ways = 15/15:
  - km-add-choice-modal: X ✅ Escape ✅ Overlay ✅
  - km-add-manual-modal: X ✅ Escape ✅ Overlay ✅
  - km-add-kantoor-modal: X ✅ Escape ✅ Overlay ✅
  - km-edit-modal: X ✅ Escape ✅ Overlay ✅
  - km-purge-modal: X ✅ Escape ✅ Overlay ✅
- ✅ Search / Maand-filter / Jaar-filter / Reset / Exporteren bestaan
- ✅ Kolommen-panel opent
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek RUN #1 + extra search-input test (live filter werkt)
- ✅ Alle 5 modals × 3 close-ways = 15/15 ✅
- ✅ Console = 0 app-errors

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 15/15 modal × close-ways = 5 modals × 3 close-ways ✅
- Bug #54 (Escape close 5 modals) gefixt + verified
- Bug #53 (data 16 records gap) gedocumenteerd voor Phase B
- Console errors 0
- BS1 superset (Exporteren / Reset / Multi-add Manual+Kantoor)

📌 DPA: Niet blokkerend voor Module 24 (Facturen - te beoordelen).
