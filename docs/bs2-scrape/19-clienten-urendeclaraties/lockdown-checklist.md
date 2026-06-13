# Module 19 — Cliënten Urendeclaraties LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 19 Urendeclaraties (urendeclaraties.html)
**Lockdown-status**: 🔒 30/30 ✅ + ULTRA-DEEP — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#49** (UI): Kolom-headers naar BS2 terminologie ("Gebudgetteerde uren" / "Geregistreerde uren")

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/hour-declarations`, h1 "Urendeclaraties"
- [x] A2. Cliënten-sidebar positie 6 (na Gemeenten)
- [x] A3. Toolbar: Search + filters Jaar/Maand/Zorgsoort + Reset + Kolommen + Maand vergrendelen
- [x] A4. 9 kolommen incl. Gebudgetteerde + Geregistreerde uren
- [x] A5. Header stats: "Uren te declareren" + "Te declareren periode"
- [x] A6. Multi-select checkbox
- [x] A7. 4 records voor mei 2026
- [x] A8. Pagination 15 default
- [x] A9. Geen extra modals
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate urendeclaraties.html, h1 "Urendeclaraties"
- [x] B2-B3. Scroll OK
- [x] B4. Jaar-select: 2024/2025/2026 (3 opties)
- [x] B5. Maand-select: Alle maanden + 12 maanden
- [x] B6. Zorgsoort-select: Alle / WIZ / Ambulant (data-driven)
- [x] B7. Reset-knop werkt
- [x] B8. Kolom-headers na Bug #49: "Gebudgetteerde uren" + "Geregistreerde uren" matchen BS2
- [x] B9. Header stats labels: "Uren te declareren" + "Te declareren periode"
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.urendeclaraties`
- [x] C2. Velden: id/client/beschikking/zorgsoort/jaar/maand/uurtarief/bedrag/gedebiteerdeUren/ingediendeUren
- [x] C3. RLS: auth-only
- [x] C4. Index op jaar+maand+client
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 7 records (2024-2026)
- [x] C7. Content spot-check: alle records have client / beschikking / zorgsoort / jaar / maand
- [x] C8. CRUD: read-only overview (CRUD via beschikkingen module)
- [x] C9. ff:urendeclaraties-updated event
- [x] C10. parity.md: 100% functioneel na Bug #49 fix

## D. ULTRA-DEEP ✅

- Alle filter-dropdowns functioneel
- Reset-knop wist filters
- Maand vergrendelen-knop click ✅
- Kolommen-panel met 6 toggles
- Sidebar Cliënten-menu cross-page consistent

## E. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅ (retroactief 2026-05-14)

### CLEAN RUN #1
- ✅ h1 "Urendeclaraties", title "Urendeclaraties — HR"
- ✅ Scroll werkt
- ✅ Kolom-headers proper: "Gebudgetteerde uren" + "Geregistreerde uren" (Bug #49 fix verified)
- ✅ 7 filter mechanismes (search/jaar/maand/zorg/reset/cols/lock) bestaan
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Kolom-headers nog steeds proper case
- ✅ Year-filter change naar 2025 toont 2 records
- ✅ Alle filters bestaan
- ✅ Console = 0 app-errors

---

## Eindstand

- 30/30 ✅
- Bug #49 verified (kolom-headers BS2-match)
- Console errors 0
- 9 kolommen + alle filters functioneel

📌 DPA: Niet blokkerend voor Module 20 (Cliënten - Uren budgetering).
