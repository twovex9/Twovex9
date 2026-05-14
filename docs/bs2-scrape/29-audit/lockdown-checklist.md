# Module 29 — Audit LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 29 Audit (audit.html, BS2 /audit)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#64** (UI): Kolommen-kiezer hide werkt niet op TD-cellen door missing `data-col` attribuut in `renderRow()` → fix toegevoegd

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /audit, h1 = "Audit Logs"
- [x] A2. Title: "Audit Logs | Embrace The Future"
- [x] A3. Toolbar: Kolommen / Resources / Veroorzaker / Actie type
- [x] A4. Table empty (0 records sandbox)
- [x] A5. Pagination: 15 of 0 total, page 1 of 1
- [x] A6. Rows per page dropdown: 10/15/30/40/50
- [x] A7. Page navigation: « ‹ › »
- [x] A8. Geen detail-modal in BS2
- [x] A9. Geen action-badge kleurcodering in BS2 vanuit DOM zichtbaar
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate audit.html, h1 = "Audit Logs"
- [x] B2. Header actions: Kolommen / Vernieuwen
- [x] B3. Toolbar: Zoeken / 3 dropdowns / Reset
- [x] B4. Table: 7 kolommen (Tijdstip/Gebruiker/Resource/Resource ID/Actie/Details/Status)
- [x] B5. 504 records visible (1-30 van 504, Pagina 1 van 17)
- [x] B6. Detail-modal × 3 close-ways = 3/3 ✅:
  - X-button ✅
  - Escape ✅
  - Overlay-click ✅
- [x] B7. Filters werken:
  - Resource "Beleidsdocument" → 10 records
  - Actie "verwijderen" → 113 records
  - Veroorzaker "Systeem" → 438 records
  - Combo Beleidsdocument+aanmaken → 10 records
- [x] B8. Reset → alle 4 (search + 3 dropdowns) gewist + 504 records terug
- [x] B9. Pagination: 17 pagina's bij 30/page, Next/Last/First werken, last page=24 rows
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabellen: `public.audit_log` (3610) + `public.beschikking_audit_log` (4)
- [x] C2. audit_log kolommen: id (uuid) / resource / resource_id / actie / gebruiker_id / gebruiker_label / details / status / ip / user_agent / aanmaakdatum
- [x] C3. RLS: auth-only
- [x] C4. 7 distinct resource types (Beleidsdocument/Beschikking/Cliënt/Factuur/Incident/Medewerker/Verlofaanvraag)
- [x] C5. 6 distinct acties (aanmaken/archiveren/bewerken/herstellen/status_wijziging/verwijderen)
- [x] C6. Read-only viewer: geen CRUD, alleen GET via auditDB
- [x] C7. Fetch cap MAX_PER_SOURCE=500 per bron (zichtbaar in audit-data.js)
- [x] C8. besa:audit-updated event na refresh / cache update
- [x] C9. Kolommen-kiezer voorkeuren persistent in `audit_columns_v1` localStorage
- [x] C10. parity.md: 100% functioneel + BS1 superset (search/reset/refresh/detail-modal/badges/2-bron merge)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

**Test methode**: navigeer naar `/audit.html?run=N` → verifieer alle features via JS DOM-probing + Bug #64 fix verification.

### CLEAN RUN #1 (post-PR #124 Bug #64 fix live)

- [x] BS1 audit.html laadt: h1="Audit Logs", 30 rows, "1-30 van 504", "Pagina 1 van 17" ✅
- [x] **TD-cellen hebben `data-col` attribuut** (Bug #64 fix live: `tdDataCol="tijdstip"`) ✅
- [x] Detail-modal × 3 close-ways = 3/3 ✅:
  - X-button ✅
  - Escape ✅
  - Overlay-click ✅
- [x] Resource filter "Beleidsdocument" → "1-10 van 10" ✅
- [x] Actie filter "verwijderen" → "1-30 van 113" ✅
- [x] Veroorzaker filter "Systeem" → "1-30 van 438" ✅
- [x] Reset-button → search="" + 3 dropdowns leeg + 504 records terug ✅
- [x] Search "Mahi" → 1 hit (matches delete-audit "Hicham el Mahi") ✅
- [x] RPP 100 → 100 rows + 6 pagina's ✅
- [x] Pagination Last → Pagina 17 van 17 (24 rows) ✅
- [x] Pagination First → Pagina 1 van 17 ✅
- [x] Kolommen-kiezer 6 toggles + close on body click ✅
- [x] **Bug #64 verified live op "Details"**: TH hidden ✅ + 30 TD cellen ALLE hidden ✅
- [x] **Bug #64 verified live op "Resource ID"**: TH hidden ✅ + 30 TD cellen ALLE hidden ✅
- [x] Toggle back ON → TH + alle TD weer visible ✅
- [x] Vernieuwen-button werkt zonder errors ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Identiek RUN #1: 30 rows, "1-30 van 504", "Pagina 1 van 17" ✅
- [x] Detail-modal × 3 close-ways = 3/3 ✅
- [x] Filter Medewerker → "1-30 van 110" ✅
- [x] Reset → 504 records terug ✅
- [x] RPP 50 → 11 pagina's ✅
- [x] **Bug #64 verified opnieuw op "Gebruiker"**: TH hidden ✅ + 30 TD cellen ALLE hidden ✅
- [x] Toggle back ON → alle visible ✅
- [x] Veroorzaker dropdown: 4 options (blank/JS/sonck802@gmail.com/Systeem) ✅
- [x] Search "bd_H03" → 1 hit (Bug #62 imported audit-record gevonden) ✅
- [x] Combo Beschikking+bewerken → 0 records (data heeft geen bewerken-actie op Beschikking, correct) ✅
- [x] Final reset → 504 records terug ✅
- [x] TD `data-col="tijdstip"` confirmed ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **3/3 modal × close-ways** (audit-detail-overlay X / Escape / Overlay)
- Bug #64 (Kolommen-kiezer TD-hide) verified live op 3 kolommen (Details/Resource ID/Gebruiker)
- 504 records visible (max 500 generic + 4 beschikking)
- Console errors 0

📌 DPA: Niet blokkerend voor Module 30 (Rollen).
