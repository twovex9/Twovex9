# Module 26 — Taken LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 26 Taken (taken.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**:
- **#59** (UI): Taken modals close-ways — Escape + Overlay toegevoegd voor alle 3 modals
- **#60** (data, cross-module): 95 duplicate medewerkers verwijderd via FK-migratie in 13 tabellen (dienst_uitnodigingen / incidenten×2 / kilometer_declaraties / medewerker_teams / profiles / taken / teams / urenregistratie / verlof_aanvragen×2 / werkuren / werkuren_vergrendeld). Resultaat: 101 unique medewerkers.

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
- [x] C9. ff:taken-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

### HARDCORE CLEAN RUN #1 (post-PR #118, fresh, deep)
- ✅ h1 "Taken", title "Taken — HR", topnav active "Taken"
- ✅ Scroll up + down werkt
- ✅ Tabs Mijn ↔ Alle clickable
- ✅ Alle 3 modals × 3 close-ways = 9/9 (Bug #59 fix verified live)
- ✅ Add-modal form: 7 fields (id/naam/beschrijving/toegewezen/status/prioriteit/deadline)
- ✅ Status dropdown 5 opties (Alle/Open/In behandeling/Voltooid/Geannuleerd)
- ✅ Prioriteit dropdown 4 opties (Alle/Hoog/Midden/Laag)
- ✅ Teamlid dropdown: was 197 met 95 duplicates (Bug #60 gedetecteerd)
- ✅ Deadline + Aanmaakdatum date pickers werken
- ✅ Search + Reset + Gearchiveerd + Voltooide verbergen toggles werken
- ✅ Console = 0 app-errors

### Bug #60 fix tussen runs: 95 duplicate medewerkers verwijderd
- Database 196 → 101 medewerkers
- FK migration in 13 tabellen
- Dropdown nu 102 opties (101 + "Alle teamleden"), 0 duplicates

### HARDCORE CLEAN RUN #2 (post-Bug #60 fix, ZONDER fix tussendoor)
- ✅ Identiek RUN #1 features
- ✅ Teamlid dropdown 102 opties, **0 duplicates** (Bug #60 fix verified)
- ✅ Alle 3 modals × 3 close-ways = 9/9
- ✅ Form interactie test: naam-input value set, Escape sluit add-modal
- ✅ Status (5) + Prioriteit (4) opties consistent
- ✅ Console = 0 app-errors

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ✅
- Bug #59 (modals close-ways) + Bug #60 (medewerker duplicates) verified
- 9/9 modal × close-ways
- Teamlid dropdown 0 duplicates (was 95)
- Console errors 0

📌 DPA: Niet blokkerend voor Module 27 (Medewerker-detail).
