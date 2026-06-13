# Module 24 — Facturen te beoordelen — STRUCTURE

**BS2 URL**: `/invoices-module/invoices-to-review`
**BS1 URL**: `https://futureflow-app.vercel.app/facturen-te-beoordelen.html`
**Scrape datum**: 2026-05-14

## BS2 page
- title: page-title genericc
- h1: **Facturen te beoordelen**
- Sidebar: 2 items "Te beoordelen" / "Alle facturen"
- Header stat: **€ 90.514,44 / 15 te beoordelen** (top-right)

## BS2 toolbar
- Search (Zoeken...)
- Gearchiveerd-toggle
- + Status filter
- + Periode filter
- Kolommen-knop

## BS2 tabel (7 kolommen)

| Kolom | Inhoud |
|---|---|
| (select) | Multi-select checkbox |
| Maand | bv. "April 2026" |
| Medewerker | Voor- + achternaam |
| Factuurnummer | bv. "20262" |
| Status | Pill: "Ingediend" |
| Aanmaakdatum | DD-MM-YYYY |
| Bedrag | € XX.XXX,XX |

15 records, all "Ingediend".

## BS1 mirror

- h1 "Facturen te beoordelen" ✅ matches BS2
- 7 kolommen identiek aan BS2 ✅
- Stat-cards: "€ X / Y Totaal te beoordelen" + "€ X / N Totaal goedgekeurd"
- Toolbar: Search / Gearchiveerd-toggle / + Status chip / + Periode chip / Kolommen
- DB field-naming: abbreviated (`fn`=factuurnummer, `besch`=beschikking, `st`=status, `bedr`=bedrag, `bedragNum`)
- 990 records totaal in DB

## Schema

- Supabase tabel: `public.facturen` (PK text)
- Velden: id / fn / besch / client / nr / clientId / per / beta / st / bedr / bedragNum / archived / aanmaakdatum / laatstGewijzigd / _data
- TODO_STATUSES (te beoordelen view): "Concept", "Ingediend", "In beoordeling", "Afgewezen", "Verlopen"

## Bugs gefixt

### Bug #55 (UI) — Filter chips dubbele "+"
- BS1 toonde "+ + Status" en "+ + Periode" omdat label config "+ Status" was en `renderButtonContent()` zelf "+" toevoegt
- Fix: labels in `facturen-te-beoordelen.js` van "+ Status" → "Status" (zonder leading +)

### Bug #56 (data) — Status values niet genormaliseerd
- Vóór: 5 unique status values mix Engels/Nederlands:
  - "submitted" (15), "draft" (7), "approved" (12), "Gedeclareerd en in behandeling" (732), "Betaald" (224)
- BS1 te-beoordelen filter TODO_STATUSES verwacht "Ingediend"/"Concept" etc.
- Page toonde 0 records omdat "submitted" niet matchte
- **Fix**: SQL UPDATE via Supabase
  - "submitted" → "Ingediend" (15)
  - "draft" → "Concept" (7)
  - "approved" → "Goedgekeurd" (12)
- Resultaat: 15 te beoordelen nu zichtbaar (matches BS2)
- 732 "Gedeclareerd en in behandeling" + 224 "Betaald" blijven (legacy historische data)

## Data state na fixes

| Status | Count |
|---|---|
| Gedeclareerd en in behandeling | 732 |
| Betaald | 224 |
| **Ingediend** (te beoordelen) | **15** |
| Goedgekeurd | 12 |
| Concept | 7 |
| **Totaal** | **990** |
