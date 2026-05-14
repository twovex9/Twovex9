# Module 24 — Facturen te beoordelen LOCKDOWN CHECKLIST

**Module**: 24 Facturen te beoordelen (facturen-te-beoordelen.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bug #55 + #56 fixes applied, wacht op merge + 2 CLEAN RUNS
**Gestart**: 2026-05-14

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
- [x] C9. besa:facturen-updated event
- [x] C10. parity.md: 100% functioneel + BS1 superset

## D. 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor (pending — na PR-merge)

### CLEAN RUN #1 — pending (na merge Bug #55+#56)
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)

- 30/30 ✅
- 2 CLEAN RUNS pending
- Bug #55 + #56 verified
- Console errors 0
- User-override afwachten

📌 DPA: Niet blokkerend voor Module 25 (Facturen - alle).
