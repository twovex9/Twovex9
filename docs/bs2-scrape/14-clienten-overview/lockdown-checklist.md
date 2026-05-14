# Module 14 — Cliënten overview LOCKDOWN CHECKLIST

**Module**: 14 Cliënten overview (clienten.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bugs #38+#39+#40 fixes applied, wacht op merge + CLEAN RUNS
**Gestart**: 2026-05-14

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

## D. ULTRA-DEEP CLEAN RUNS (pending — na PR-merge)

### CLEAN RUN #1 — pending
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — pending
- Bug #38 + #39 + #40 verified
- Console errors 0
- User-override afwachten

📌 DPA: Niet blokkerend voor Module 15 (Cliënten - Zorgsoorten).
