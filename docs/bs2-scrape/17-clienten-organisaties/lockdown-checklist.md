# Module 17 — Cliënten Organisaties LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 17 Organisaties (organisatie.html)
**Lockdown-status**: 🔒 30/30 ✅ + 9/9 modal × close-ways + ULTRA-DEEP — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#48** (data): 3 BS2 organisaties (IHub / Youz / Gripzorg) toegevoegd via SQL INSERT

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/organizations`, h1 "Organisatie"
- [x] A2. Cliënten-sidebar positie 4 (na Beschikkingen-group)
- [x] A3. Toolbar: Zoeken + Gearchiveerd-toggle + Kolommen + Organisatie toevoegen
- [x] A4. 1 hoofdkolom: Naam
- [x] A5. 4 records: Planet Young / IHub / Youz / Gripzorg
- [x] A6. Multi-select checkbox header
- [x] A7. Rows per page 15 default
- [x] A8. Geen extra filters
- [x] A9. Pagination
- [x] A10. Console errors BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate organisatie.html, title "Organisatie — HR", h1 "Organisatie"
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close: X ✅ Escape ✅ Overlay ✅
- [x] B5. Archive-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅
- [x] B6. Purge-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅ (via temp-archive IHub)
- [x] B7. Search "IHub" → 1 row, restore 15
- [x] B8. Gearchiveerd-toggle werkt
- [x] B9. Kolommen-panel met 1 toggle (Naam)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.organisaties` (PK text)
- [x] C2. Velden: id/naam/archived/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Index op naam
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 93 records (na Bug #48 +3 toegevoegd)
- [x] C7. Content spot-check: alle 4 BS2 records aanwezig
- [x] C8. CRUD: add/archive/restore/purge alle werken
- [x] C9. besa:organisaties-updated event
- [x] C10. parity.md: 100% functioneel, BS1 superset (broader context)

## D. ULTRA-DEEP — 9/9 modal × close-ways ✅

- Add modal: X ✅ Escape ✅ Overlay ✅
- Archive modal: X ✅ Escape ✅ Overlay ✅ + slider
- Purge modal: X ✅ Escape ✅ Overlay ✅ + slider (temp-archived IHub voor test, restored cleanup)

## E. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅ (retroactief 2026-05-14)

### CLEAN RUN #1
- ✅ h1 "Organisatie", total 93 records
- ✅ Scroll werkt
- ✅ Add modal × 3 close (X / Escape / Overlay)
- ✅ Search "IHub" → 1 row
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ h1 + 93 records consistent
- ✅ Add modal × 3 close
- ✅ Archive modal × 3 close + slider
- ✅ Kolommen-panel opent
- ✅ Console = 0 app-errors

---

## Eindstand

- 30/30 ✅
- 9/9 modal × close-ways ✅
- Alle 4 BS2 records in BS1 (na Bug #48)
- 93 records totaal (BS1 superset)
- Console errors 0

📌 DPA: Niet blokkerend voor Module 18 (Cliënten - Gemeenten).
