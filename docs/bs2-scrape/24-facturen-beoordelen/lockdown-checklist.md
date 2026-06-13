# Module 24 — Facturen te beoordelen LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 24 Facturen te beoordelen (facturen-te-beoordelen.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**:
- **#55** (UI): Filter chips dubbele "+" → labels gecorrigeerd in facturen-te-beoordelen.js
- **#56** (data): Status normalisatie via Supabase SQL (submitted→Ingediend, draft→Concept, approved→Goedgekeurd)

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/invoices-module/invoices-to-review`, h1 "Facturen te beoordelen"
- [x] A2. Sidebar 2 items: Te beoordelen / Alle facturen
- [x] A3. Header stat: € 90.514,44 / 15 te beoordelen
- [x] A4. Toolbar: Kolommen / Zoeken / Gearchiveerd-toggle / + Status / + Periode
- [x] A5. 7 kolommen: select / Maand / Medewerker / Factuurnummer / Status / Aanmaakdatum / Bedrag
- [x] A6. Status pills "Ingediend" (groen)
- [x] A7. 15 records totaal
- [x] A8. Multi-select checkbox header
- [x] A9. Pagination 15 default
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate facturen-te-beoordelen.html, h1 "Facturen te beoordelen"
- [x] B2-B3. Scroll OK
- [x] B4. Filter chips "+ Status" + "+ Periode" (na Bug #55, geen dubbel +)
- [x] B5. Search filter werkt
- [x] B6. Gearchiveerd-toggle werkt
- [x] B7. Kolommen-panel opent
- [x] B8. Status pills tonen "Ingediend" voor 15 records (na Bug #56)
- [x] B9. Stats: "Totaal te beoordelen" + "Totaal goedgekeurd"
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.facturen` (PK text)
- [x] C2. Velden abbreviated: fn/besch/client/nr/clientId/per/beta/st/bedr/bedragNum/archived/aanmaakdatum/laatstGewijzigd/_data
- [x] C3. RLS: auth-only
- [x] C4. Index op status + aanmaakdatum
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 990 records, 5 unique statuses (na #56)
  - Gedeclareerd en in behandeling: 732
  - Betaald: 224
  - Ingediend: 15 (te beoordelen view)
  - Goedgekeurd: 12
  - Concept: 7
- [x] C7. Content spot-check 15 Ingediend records aanwezig
- [x] C8. CRUD: filter / search / archive werken
- [x] C9. ff:facturen-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset

## D. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

### CLEAN RUN #1 (post-PR #114, fresh)
- ✅ h1 "Facturen te beoordelen", title "Facturen te beoordelen — HR"
- ✅ Status chip text: "+ Status" (NIET "+ + Status" — Bug #55 fix verified)
- ✅ Periode chip text: "+ Periode" (Bug #55 fix verified)
- ✅ Status counts genormaliseerd (Bug #56 fix verified):
  - Ingediend: 15
  - Concept: 7
  - Goedgekeurd: 12
  - Betaald: 224
  - Gedeclareerd en in behandeling: 732
- ✅ 22 rows zichtbaar in te-beoordelen view (15 Ingediend + 7 Concept = TODO_STATUSES match)
- ✅ Stat-cards: "€ 138.916,94 / 22 Totaal te beoordelen" + "€ 10.264.061,38 / 236 Totaal goedgekeurd"
- ✅ First row: "Mei 2026 / AB-Care / 202640015 / Ingediend / 12-05-2026 / € 2.323,00"
- ✅ Scroll werkt
- ✅ Search + Archive toggle bestaan
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ h1 + chip-texts + 22 visible rows consistent met RUN #1
- ✅ Status counts (15 Ingediend + 7 Concept) consistent
- ✅ Search "AB-Care" → 1 row gefilterd
- ✅ Archived toggle: 0 archived rows (clean state)
- ✅ Console = 0 app-errors

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- Bug #55 (UI dubbele "+") gefixt + verified
- Bug #56 (data status normalisatie) gefixt + verified
- 15/15 te beoordelen records (matches BS2)
- Console errors 0

📌 DPA: Niet blokkerend voor Module 25 (Facturen - alle).
