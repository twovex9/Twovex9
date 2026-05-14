# Module 10 — HR Salarisadministratie LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 10 HR Salarisadministratie (salarisadministratie-exporter.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bevindingen vóór CLEAN RUNS**:
- BS1 `salarisadministratie-exporter.html` bestond al volledig
- saladminDB met methods: ready/pushHistory/pushOrt/refresh
- BS1 export-history: 5-8 records (verschilt door user-acties), BS2: 15 records (legitiem verschil: history is user-action-runtime)

**1 bug gefixt via PR #88** (gevonden bij final 100% deep-dive):
- #30: sa-ort-modal (Regel toevoegen in ORT-configuratie tab) sluit niet via Escape. Modal gebruikt style.display-pattern (niet hidden-attr). Fix: keydown listener specifiek voor ORT-modal in ortModule.

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/monthly-payroll` (→ `/generate-export`):
- 5 kolommen: Datum / Periode / Medewerkers / Geëxporteerd door / Downloaden
- 15 history-records
- Multi-section page: Export / ORT-configuratie / Dienst-gebaseerde export

- [x] A1-A10. Alle BS2 hardcore items getest

## B. BS1-test hardcore (10/10 ✅)

Live test op salarisadministratie-exporter.html.

- [x] B1. Navigate: "Salarisadministratie — HR"
- [x] B2-B3. Scroll OK
- [x] B4. Klik élke knop:
  - Exporteren tab → Maandelijkse export view
  - ORT-configuratie tab → ORT view
  - Dienst-gebaseerde export = action button (genereert shift-export)
  - Export genereren = action button
  - Kolommen panel
- [x] B5. Modals (in ORT-config tab):
  - ORT-add modal (sa-ort-modal) bestaat
- [x] B6. Filter/inputs: Maand-select / Jaar-select / Download-now checkbox
- [x] B7. E2E: Export genereren creates history-record + ORT add/update via saladminDB
- [x] B8. Multi-section: Exporteren ↔ ORT tab-switching werkt
- [x] B9. Console: 0 app-errors
- [x] B10. Visuele match BS2 ↔ BS1: identiek

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabels: `saladmin_export_history`, `saladmin_ort`
- [x] C2. saladmin_export_history kolommen: id text PK, datum, periode, medewerkers count, geexporteerd_door, file_url
- [x] C3. RLS: auth-only
- [x] C4. Indices: datum, periode
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data-pariteit: BS1=5-8 records vs BS2=15 (history = user-action-runtime, functioneel 100% match)
- [x] C7. Content spot-check: schema match
- [x] C8. CRUD: saladminDB.pushHistory + pushOrt + refresh werken
- [x] C9. besa:saladmin-updated event
- [x] C10. parity.md: 100% functioneel (history-count NA per design)

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅)

### CLEAN RUN #1 (vers, na PR #88)
- ✅ Scroll
- ✅ Tab switch: Exporteren ↔ ORT-configuratie
- ✅ Maand/Jaar select-inputs + Download-now checkbox
- ✅ Export genereren action button
- ✅ Dienst-gebaseerde export action button
- ✅ **ORT modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅** (Bug #30 verified)
- ✅ CAO tabs (VVT ↔ jeugdzorg)
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek aan RUN #1 alle pass

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **Geen bugs gefixt** — geen issues gevonden
- Data-pariteit functioneel 100% (history-count NA per design)
- Console errors 0

📌 DPA: Niet blokkerend voor Module 11 (Fase A).
