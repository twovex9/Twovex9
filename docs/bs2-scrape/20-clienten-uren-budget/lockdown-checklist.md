# Module 20 — Cliënten Uren budgetering LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 20 Uren budgetering (uren-budgettering.html)
**Lockdown-status**: 🔒 30/30 ✅ + ULTRA-DEEP — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#50** (UI/spelling): "Uren budgettering" → "Uren budgetering" (single 't' matches BS2)
  - 19 HTML files sidebar-links + uren-budgettering.html title + h1

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/weekly-budget`, h1 "Uren budgetering"
- [x] A2. Cliënten-sidebar positie 7 (na Urendeclaraties)
- [x] A3. Toolbar: Cliënt-selector + Jaar-selector
- [x] A4. 2 kolommen: Weken / Standaard uren
- [x] A5. 52 weken rijen (week 1 - Dec 29 2025 t/m week 52)
- [x] A6. Banner "Selecteer cliënt om verder te gaan"
- [x] A7. Geen extra modals
- [x] A8. Geen pagination (alle 52 weken zichtbaar)
- [x] A9. Subtitle "Configureer standaard uren en publiceer wekelijkse budgetten..."
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate uren-budgettering.html, h1 "Uren budgetering" (na Bug #50)
- [x] B2-B3. Scroll OK
- [x] B4. Cliënt-selector #ub-sel-client
- [x] B5. Jaar-selector #ub-sel-year (2024/2025/2026)
- [x] B6. 52 weken rijen rendered
- [x] B7. Subtitle matches BS2
- [x] B8. Kolommen-knop met 2 toggles
- [x] B9. Bulk bewerken-knop (BS1 extra feature)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.uren_budget`
- [x] C2. Velden: id/clientId/jaar/week/standaardUren/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. UNIQUE constraint op (clientId, jaar, week)
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: per cliënt × jaar × week records
- [x] C7. Helper `setCell(clientId, jaar, week, uren)` voor single-cell save
- [x] C8. CRUD via cell-edit on blur
- [x] C9. besa:uren-budget-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset (Bulk bewerken)

## D. ULTRA-DEEP ✅

- Spelling correctie 19 files
- Display labels match BS2 exact
- Bulk bewerken-functie blijft werkend (extra feature)
- Cliënt-selector + Jaar-selector werken

## E. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅ (retroactief 2026-05-14)

### CLEAN RUN #1
- ✅ h1 "Uren budgetering" (Bug #50 fix verified — single 't')
- ✅ Title "Uren budgetering — HR"
- ✅ Scroll werkt
- ✅ Cliënt-selector + Jaar-selector bestaan
- ✅ Bulk bewerken-knop + Verlaat bulk bewerken bestaan
- ✅ Kolommen-knop bestaat
- ✅ 52 weken rijen rendered
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek RUN #1
- ✅ Alle 5 controls bestaan (#ub-sel-client, #ub-sel-year, #ub-columns-menu-btn, #ub-bulk-start, #ub-bulk-exit)
- ✅ 52 weken rijen consistent
- ✅ Console = 0 app-errors

---

## Eindstand

- 30/30 ✅
- Bug #50 verified (spelling)
- Console errors 0
- 52 weken rijen rendered correct

📌 DPA: Niet blokkerend voor Module 21 (Cliënten - Facturen importeren).
