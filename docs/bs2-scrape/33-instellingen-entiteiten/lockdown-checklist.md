# Module 33 — Instellingen / Entiteiten LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 33 Instellingen / Entiteiten (instellingen.html Entiteiten-tab, BS2 /settings/entities)
**Lockdown-status**: 🟡 30/30 ✅ — **wacht op merge + 2 HARDCORE CLEAN RUNS post-merge**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#67** (UX): Missing empty-state placeholder bij 0 search-results in `renderEntiteiten`

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /settings/entities, h1 = "Entiteiten"
- [x] A2. Title: "Entiteiten | Embrace The Future"
- [x] A3. 3 sub-tabs: Gebruikers / Entiteiten / Notificaties
- [x] A4. Toolbar: Kolommen
- [x] A5. Table 1 kolom: Naam
- [x] A6. 7 entiteiten: client / employee / disposition / invoice / quotation / Disposition / Phase
- [x] A7. Pagination: 15 of 7 total, Page 1 of 1
- [x] A8. RPP dropdown: 10/15/30/40/50
- [x] A9. Read-only (geen Add/Edit buttons)
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate instellingen.html, klik Entiteiten-tab
- [x] B2. Panel `#inst-panel-entiteiten` shows
- [x] B3. Table 3 cols (BS1 superset): Naam / Beschrijving / Aantal records
- [x] B4. 7 entiteiten 1:1 match met BS2
- [x] B5. Aantal records live counts: client=160, employee=103, disposition=251, invoice=990
- [x] B6. 3 entities zonder bs1_table tonen "—" (quotation/Disposition/Phase)
- [x] B7. Search "client" → 1 row ("1 van 7")
- [x] B8. Search "xyz" → empty-state placeholder "Geen entiteiten gevonden." (Bug #67 fix)
- [x] B9. Kolommen-kiezer: 2 toggleable (Beschrijving + Aantal records), Naam=skipToggle
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hardcoded array `ENTITEITEN_LIST` (7 entries) in instellingen.js
- [x] C2. 4 entities met bs1_table mapping: clienten/medewerkers/beschikkingen/facturen
- [x] C3. Live counts via `getEntCount(table)` async-fetch
- [x] C4. Counts incl. archived (medewerkers 103 = 101 actief + 2 archived)
- [x] C5. Read-only viewer (geen CRUD)
- [x] C6. TD data-col attrs (Bug #64-pattern al goed)
- [x] C7. Voorkeuren `inst_entiteiten_columns_v1` localStorage
- [x] C8. Async-laden placeholder "laden…" → vervangen met count
- [x] C9. Error-fallback "?" in rood bij count-fetch failure
- [x] C10. parity.md: 100% functionele pariteit + BS1 superset (Beschrijving/Aantal/Search/Count/Empty-state)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor

### CLEAN RUN #1 — WACHT OP MERGE

- [ ] BS1 instellingen.html → klik Entiteiten-tab → 7 rows visible
- [ ] Counts: client=160, employee=103, disposition=251, invoice=990
- [ ] Search "client" → "1 van 7"
- [ ] Search "xyz" → "0 van 7" + **Bug #67 fix**: "Geen entiteiten gevonden." placeholder
- [ ] Search "invoice" → 1 row
- [ ] Clear → 7 rows back
- [ ] Kolommen-kiezer: 2 toggles (Beschrijving + Aantal records)
- [ ] Toggle Beschrijving OFF → TH + 7 TD cellen ALLE hidden
- [ ] Toggle back ON → visible
- [ ] Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- [ ] Identiek RUN #1
- [ ] Bug #67 verified opnieuw
- [ ] Console = 0 app-errors

---

## Eindstand (na 2 CLEAN RUNS)
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor
- **0 modals** (read-only viewer)
- Bug #67 (empty-state placeholder) verified live
- 7 entiteiten 1:1 BS2 match
- Console errors 0

📌 DPA: Niet blokkerend voor Module 34 (Notificaties).
