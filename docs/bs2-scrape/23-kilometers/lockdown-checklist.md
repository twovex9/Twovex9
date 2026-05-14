# Module 23 — Kilometers LOCKDOWN CHECKLIST

**Module**: 23 Kilometers (kilometers.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bug #54 fix applied, wacht op merge + 2 CLEAN RUNS (hardcore-regel)
**Gestart**: 2026-05-14

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
- [x] C9. besa:kilometers-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset (Exporteren / Reset / 2 add-types)

## D. ULTRA-DEEP CLEAN RUNS (pending — na PR-merge)

### CLEAN RUN #1 — pending (na merge Bug #54 fix)
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)

- 30/30 ✅ pending CLEAN RUNS
- 15/15 modal × close-ways: 5 modals × 3 close-ways
- Bug #54 fix verified ✅
- Bug #53 gedocumenteerd
- Console errors 0

📌 DPA: Niet blokkerend voor Module 24 (Facturen - te beoordelen).
