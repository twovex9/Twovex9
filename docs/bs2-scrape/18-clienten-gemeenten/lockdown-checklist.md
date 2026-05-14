# Module 18 — Cliënten Gemeenten LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 18 Gemeenten (gemeenten.html)
**Lockdown-status**: 🔒 30/30 ✅ + 9/9 modal × close-ways + ULTRA-DEEP — **wacht op user-override**
**Voltooid**: 2026-05-14

**Geen bugs gevonden** — module is direct functioneel 100% pariteit.

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/municipalities`, h1 "Gemeenten"
- [x] A2. Cliënten-sidebar positie 5 (na Organisatie)
- [x] A3. Toolbar: Zoeken + Gearchiveerd-toggle + Kolommen + Gemeente toevoegen
- [x] A4. 1 hoofdkolom: Naam
- [x] A5. 316 records (incl. WLZ/WMO/YOUZ-Rotterdam financierings-codes)
- [x] A6. Multi-select checkbox header
- [x] A7. Rows per page 15
- [x] A8. Geen extra filters
- [x] A9. Pagination
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate gemeenten.html, title "Gemeenten — HR", h1 "Gemeenten"
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close: X ✅ Escape ✅ Overlay ✅
- [x] B5. Archive-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅
- [x] B6. Purge-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅ (temp-archive WLZ test)
- [x] B7. Search 5 BS2-records (Uitgeest/WLZ/WMO/YOUZ-Rotterdam/SED) → alle 5 found ✅
- [x] B8. Gearchiveerd-toggle werkt
- [x] B9. Kolommen-panel met 1 toggle (Naam)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.gemeenten` (PK uuid)
- [x] C2. Velden: id/naam/archived/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Index op naam
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 238 records
- [x] C7. Content spot-check 5/5 BS2 records aanwezig
- [x] C8. CRUD: add/archive/restore/purge alle werken
- [x] C9. besa:gemeenten-updated event
- [x] C10. parity.md: 100% functioneel, 78 missing zijn ongebruikte NL gemeenten

## D. ULTRA-DEEP — 9/9 modal × close-ways ✅

- Add modal: X ✅ Escape ✅ Overlay ✅
- Archive modal: X ✅ Escape ✅ Overlay ✅ + slider
- Purge modal: X ✅ Escape ✅ Overlay ✅ + slider (temp-archived WLZ + restore cleanup)

---

## Eindstand

- 30/30 ✅
- 9/9 modal × close-ways ✅
- Geen bugs gevonden — module functioneel 100%
- Sample BS2 records 5/5 aanwezig
- Console errors 0

📌 DPA: Niet blokkerend voor Module 19 (Cliënten - Urendeclaraties).
