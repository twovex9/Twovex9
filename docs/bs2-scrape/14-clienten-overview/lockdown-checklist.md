# Module 14 — Cliënten overview LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS + ULTRA-DEEP)

**Module**: 14 Cliënten overview (clienten.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS ZONDER fix tussendoor + ULTRA-DEEP 100% — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**:
- **#38** (data): 6 fase-values (case-mix) → 3 unieke values via SQL UPDATE
- **#39** (data): "Test Client" record verwijderd via SQL DELETE
- **#40** (UI): Add/Archive/Purge modals — Escape + Overlay close-ways toegevoegd

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/overview`, h1 "Cliënten"
- [x] A2. Sidebar Cliënten positie 1 in cliënten-menu
- [x] A3. Toolbar: Search + filter-chips + Kolommen + Exporteren + Cliënt toevoegen
- [x] A4. Tabel 10 cols: Voornaam/Achternaam/Cliëntnummer/Locatie/Fase/Gemeente/Organisatie/Required forms/Uit zorg datum + Acties
- [x] A5. Fase pills (groene "In zorg")
- [x] A6. Multi-select checkbox header
- [x] A7. Sort dropdowns per kolom (Asc/Desc/Hide)
- [x] A8. 87 records in default-view
- [x] A9. Pagination 15 default rows
- [x] A10. Console errors BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate clienten.html, title "Cliënten — HR", h1 "Cliënten"
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close: X ✅ Escape ✅ (Bug #40 fix) Overlay ✅ (Bug #40 fix)
- [x] B5. Archive-modal × 3 close + slider: X ✅ Escape ✅ (Bug #40) Overlay ✅ (Bug #40)
- [x] B6. Purge-modal × 3 close + slider: X ✅ Escape ✅ (Bug #40) Overlay ✅ (Bug #40)
- [x] B7. Search filter werkt ("Ader" → 2 rows)
- [x] B8. Gearchiveerd-toggle werkt
- [x] B9. Kolommen-panel met 10 toggles
- [x] B10. Exporteren-knop bestaat + Console = 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.clienten` (PK text)
- [x] C2. Kolommen: id/voornaam/achternaam/clientnummer/locatie/fase/gemeente/organisatie/archived/aanmaakdatum/laatst_gewijzigd/data(jsonb)
- [x] C3. RLS: auth-only
- [x] C4. Index op clientnummer + archived
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 160 records (na Test Client cleanup), 3 clean fase-values
- [x] C7. Content spot-check: 12 BS1-only records, 148 met bs2_id in data jsonb
- [x] C8. CRUD: add/archive/restore/purge alle werken
- [x] C9. besa:clienten-updated event
- [x] C10. parity.md: functioneel 100%, data-count gap → Fase B/D scope

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ ZONDER fix tussendoor)

### CLEAN RUN #1 (post-PR #100, fresh)
- ✅ Bug #38 verify: 3 unique phases (In zorg=116, Uit zorg=36, In aanvraag=8)
- ✅ Bug #39 verify: Total=160, Test Client gone
- ✅ Bug #40 verify Add-modal: X ✅ Escape ✅ Overlay ✅
- ✅ Bug #40 verify Archive-modal: X ✅ Escape ✅ Overlay ✅ + slider
- ✅ Search "Ader" → 2 rows, restored 50
- ✅ Gearchiveerd toggle werkt
- ✅ Kolommen panel opent (10 toggles)
- ✅ Exporteren-knop bestaat
- ✅ Topnav active = "Cliënten"
- ✅ Scroll werkt

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Add-modal: X/Esc/Overlay alle 3 sluiten
- ✅ Archive-modal: X/Esc/Overlay alle 3 sluiten
- ✅ Sidebar consistent (Cliënten + Zorgsoorten + Beschikkingen-group + Organisatie + Gemeenten + Urendeclaraties + Urenbudgetering + Facturen importeren + Incidenten-group)
- ✅ Console = 0 app-errors

## E. ULTRA-DEEP — Purge-modal full 3-close-ways test

Temp-archived record `cl_184` (Raymond Ader) om purge-modal te kunnen testen.
- ✅ Purge modal opens via trash-icon op archived row
- ✅ Has slider (huisstijl-conform)
- ✅ Close by X (`#cl-purge-close`) ✅
- ✅ Close by Escape (Bug #40 fix verified) ✅
- ✅ Close by Overlay-click (Bug #40 fix verified) ✅
- ✅ Restored cl_184 + final archived count = 0 (clean state)

## F. Cross-page sidebar consistency

- zorgsoorten.html: Cliënten-link bestaat ✅, topnav "Cliënten" active ✅
- beschikkingen.html: Cliënten-link bestaat ✅, h1 "Beschikkingen" ✅
- Sidebar volgorde matches BS2 (Cliënten / Zorgsoorten / Beschikkingen / Organisatie / Gemeenten / Urendeclaraties / Urenbudgetering / Facturen importeren / Incidenten)

---

## Eindstand

- 30/30 ✅ (A+B+C)
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- ULTRA-DEEP final 100% check ✅
- **Alle 3 modals × 3 close-ways = 9/9** ✅ (Add + Archive + Purge)
- Bugs gefixt: **#38** (phase case 6→3), **#39** (Test Client cleanup), **#40** (modals close-ways)
- Console errors 0
- Sidebar volgorde matches BS2 (Cliënten module, 9 items)
- 160 records (na cleanup), 3 clean phase-values

📌 DPA: Niet blokkerend voor Module 15 (Cliënten - Zorgsoorten).
