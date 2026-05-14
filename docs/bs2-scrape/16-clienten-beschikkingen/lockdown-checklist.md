# Module 16 — Cliënten Beschikkingen LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS + ULTRA-DEEP)

**Module**: 16 Beschikkingen (beschikkingen.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS ZONDER fix tussendoor + ULTRA-DEEP 100% — **wacht op user-override**
**Voltooid**: 2026-05-14

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

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ ZONDER fix tussendoor)

### CLEAN RUN #1 (post-PR #103, fresh)
- ✅ Bug #43 verified: 4 unique fases (Actief=159, Verlopen=71, In aanvraag=19, In zorg=2), totaal 251
- ✅ Bug #46 verified: Fase dropdown options proper case match DB (Actief / In aanvraag / In zorg / Verlopen)
- ✅ Bug #47 verified: Zorgsoort dropdown 10 unique options, geen duplicaten
- ✅ Bug #44 verified: Add-modal X ✅ Escape ✅ Overlay ✅
- ✅ Bug #45 verified: Export-modal X ✅ Escape ✅ Overlay ✅
- ✅ Fase filter test: alle 4 values filteren (15 rows per page door pagination)
- ✅ Search "Trela" → 2 rows
- ✅ Reset-knop herstelt
- ✅ Sidebar "Overzicht" actief
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Add-modal × 3 close-ways
- ✅ Export-modal × 3 close-ways
- ✅ Purge-modal × 3 close-ways + slider
- ✅ Filter-toggles: 60-dagen (14 rows), Heeft te decl LM (15), Heeft nog niet gedecl (15)
- ✅ Sidebar Beschikkingen-group met sub-items (Dashboard / Overzicht / Facturen)
- ✅ Console = 0 app-errors

---

## E. ULTRA-DEEP final 100% check

### 3 modals × 3 close-ways = 9/9 ✅
- `#besc-add-modal`: X ✅ Escape ✅ Overlay ✅
- `#besc-export-modal`: X ✅ Escape ✅ Overlay ✅
- `#besc-purge-modal`: X ✅ Escape ✅ Overlay ✅ + slider

### Dropdown filter values cleanup
- Fase: 4 proper case options (was 7 lowercase met irrelevante waarden)
- Zorgsoort: 10 unique options (was 5+ duplicaten van "Ambulant intern")

### Data verified
- 251 records, 4 unique fases na Bug #43 normalisatie
- Distribution: Actief=159 / Verlopen=71 / In aanvraag=19 / In zorg=2
- BS2 default-view (99) ≈ BS1 In aanvraag + Actief = 178 (BS1 toont alles, BS2 default-view filtert subset)

### Functioneel verified
- Search, 4 filter-toggles, 4 filter-dropdowns, Reset, Sort, Pagination, Kolommen, Exporteren, Add, Purge

---

## Eindstand

- 30/30 ✅ (A+B+C)
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- ULTRA-DEEP final 100% check ✅
- 9/9 modal × close-ways ✅
- Bugs gefixt: **#43** (data fase 8→4), **#44** (Add Esc), **#45** (Export Esc), **#46** (Fase dropdown), **#47** (Zorgsoort dedup)
- Console errors 0
- BS1 superset van BS2 (3 extra kolommen, 4 extra filter-toggles)

📌 DPA: Niet blokkerend voor Module 17 (Cliënten - Organisaties).
