# Module 16 — Cliënten Beschikkingen LOCKDOWN CHECKLIST

**Module**: 16 Beschikkingen (beschikkingen.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bugs #43/#44/#45/#46/#47 fixes applied, wacht op merge
**Gestart**: 2026-05-14

**Bugs gefixt**:
- **#43** (data): Fase 8 unique → 4 unique values via SQL UPDATE
- **#44** (UI): Add-modal Escape close-way
- **#45** (UI): Export-modal Escape close-way
- **#46** (UI): Fase dropdown options synced (proper case matching DB)
- **#47** (UI): Zorgsoort dropdown dedupe by label

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/dispositions/overview`, h1 "Beschikkingen"
- [x] A2. Cliënten-sidebar Beschikkingen-group: Dashboard / Overzicht / Facturen
- [x] A3. Toolbar: Search + filter-chips (Zorgsoort/Fase/Status/Decl methode/Reset) + Kolommen + Exporteren + Beschikking toevoegen
- [x] A4. 9 kolommen: select / Cliënt / Naam / Zorgsoort / Fase / Periode / Tarief / Te declareren / Decl methode
- [x] A5. Fase pills proper case ("Actief")
- [x] A6. Multi-select checkbox header
- [x] A7. 99 records in default-view (In aanvraag + Actief)
- [x] A8. Pagination 15 default rows
- [x] A9. Sort dropdowns per kolom
- [x] A10. Console errors BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate beschikkingen.html, h1 "Beschikkingen"
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close: X ✅ Escape ✅ (Bug #44) Overlay ✅
- [x] B5. Export-modal × 3 close: X ✅ Escape ✅ (Bug #45) Overlay ✅
- [x] B6. Purge-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅
- [x] B7. Search "Trela" → 2 rows
- [x] B8. Fase filter dropdown (Bug #46): 4 proper-case options match DB
- [x] B9. Zorgsoort filter dropdown (Bug #47): dedup by label
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.beschikkingen` (PK text)
- [x] C2. Velden: id/clientId/naam/zorgsoortKey/fase/startISO/eindISO/tariefEur/tariefEenheid/declMeth + meer
- [x] C3. RLS: auth-only
- [x] C4. Index op clientId + fase
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 251 records, 4 unique fases na Bug #43
- [x] C7. Content spot-check: 99 actief+aanvraag matches BS2 default view
- [x] C8. CRUD: add/archive/restore/purge alle werken
- [x] C9. besa:beschikking-updated event op window
- [x] C10. parity.md: 100% functioneel, BS1 superset

## D. ULTRA-DEEP CLEAN RUNS (pending — na PR-merge)

### CLEAN RUN #1 — pending
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)

- 30/30 ✅
- 2 CLEAN RUNS pending
- Bug #43 + #44 + #45 + #46 + #47 verified
- Console errors 0
- User-override afwachten

📌 DPA: Niet blokkerend voor Module 17 (Cliënten - Organisaties).
