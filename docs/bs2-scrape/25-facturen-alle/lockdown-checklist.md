# Module 25 — Facturen alle LOCKDOWN CHECKLIST

**Module**: 25 Facturen alle (facturen.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bug #57 + #58 fixes, wacht op merge + 2 CLEAN RUNS
**Gestart**: 2026-05-14

**Bugs gefixt**:
- **#57** (UI): h1 "Facturen" → "Alle facturen" (matches BS2)
- **#58** (UI): Escape close-way toegevoegd voor fact-add-modal + fact-export-modal

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /invoices-module/monthly-invoices, h1 "Alle facturen"
- [x] A2. Sidebar Facturen: Te beoordelen / Alle facturen (active)
- [x] A3. Default filter status=submitted+approved, periode=mei 2026
- [x] A4. Toolbar: Kolommen + Periode chip + Reset
- [x] A5. 7 kolommen: select/Maand/Medewerker/Factuurnummer/Status/Aanmaakdatum/Bedrag
- [x] A6. Status pills (Ingediend/Goedgekeurd)
- [x] A7. 27 records in default-view
- [x] A8. Multi-select checkbox header
- [x] A9. Pagination
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate facturen.html, h1 "Alle facturen" (na Bug #57)
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close: X / Escape (na Bug #58) / Overlay
- [x] B5. Export-modal × 3 close: X / Escape (na Bug #58) / Overlay
- [x] B6. Arch-modal × 3 close + slider
- [x] B7. Purge-modal × 3 close + slider
- [x] B8. 4 filter-dropdowns + 2 toggles + Reset
- [x] B9. Search + Kolommen + Exporteren
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Supabase tabel `public.facturen` (gedeeld met Module 24)
- [x] C2. Velden: id/fn/besch/client/nr/clientId/per/beta/st/bedr/bedragNum/archived/aanmaakdatum/laatstGewijzigd/_data
- [x] C3. RLS: auth-only
- [x] C4. Index op status + aanmaakdatum
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 990 records, 5 unique statuses (Module 24 normalisatie verified)
- [x] C7. Spot-check Ingediend (15) + Goedgekeurd (12) + Concept (7) + Betaald (224) + Gedeclareerd... (732)
- [x] C8. CRUD: add/edit/archive/purge alle werken
- [x] C9. besa:facturen-updated event
- [x] C10. parity.md: BS1 uitgebreid superset

## D. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor (pending — na PR-merge)

### CLEAN RUN #1 — pending
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)
- 30/30 ✅
- 2 CLEAN RUNS pending
- Bug #57 + #58 verified
- Console errors 0

📌 DPA: Niet blokkerend voor Module 26 (Taken).
