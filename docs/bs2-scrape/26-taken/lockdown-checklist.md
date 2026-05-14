# Module 26 — Taken LOCKDOWN CHECKLIST

**Module**: 26 Taken (taken.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bug #59 fix applied, wacht op merge + 2 CLEAN RUNS
**Gestart**: 2026-05-14

**Bug gefixt**:
- **#59** (UI): Taken modals close-ways — Escape + Overlay toegevoegd voor alle 3 modals (add/archive/purge)

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate `/tasks/list`, h1 "Taken"
- [x] A2. Top-nav: Taken (active)
- [x] A3. 2 tabs: Mijn taken (default) / Alle taken
- [x] A4. Toolbar: + Taak toevoegen + Voltooide verbergen + alle filters
- [x] A5. 6 kolommen: Taaknaam/Toegewezen aan/Aangemaakt door/Status/Deadline/Prioriteit
- [x] A6. Deadline-grouped view: Vandaag/Te laat/Deze week/Later/Geen deadline
- [x] A7. 0 records (empty state "Geen taken")
- [x] A8. Search "Search tasks..."
- [x] A9. Reset knop
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate taken.html, h1 "Taken"
- [x] B2-B3. Scroll OK
- [x] B4. Tabs: #taken-tab-mine + #taken-tab-all
- [x] B5. Add-modal × 3 close (na Bug #59): X / Escape / Overlay
- [x] B6. Archive-modal × 3 close + slider (na Bug #59)
- [x] B7. Purge-modal × 3 close + slider (na Bug #59)
- [x] B8. Filters: Status (4 opties) / Prioriteit (3) / Teamlid (197) / 2 datums
- [x] B9. Toggles: Gearchiveerd + Voltooide verbergen
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Supabase tabel `public.taken`
- [x] C2. Velden: id/naam/beschrijving/toegewezenAan/aangemaaktDoor/status/prioriteit/deadline/aanmaakdatum/archived/laatstGewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Indices op status/toegewezenAan/deadline
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 0 records (BS1 + BS2 beide empty)
- [x] C7. Status enum: open/in_progress/voltooid/geannuleerd
- [x] C8. Prioriteit enum: hoog/midden/laag
- [x] C9. besa:taken-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset

## D. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor (pending — na PR-merge)

### CLEAN RUN #1 — pending (na merge Bug #59)
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)
- 30/30 ✅
- 2 CLEAN RUNS pending
- Bug #59 verified
- Console errors 0

📌 DPA: Niet blokkerend voor Module 27 (Medewerker-detail).
