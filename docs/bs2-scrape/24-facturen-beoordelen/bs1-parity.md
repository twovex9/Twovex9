# Module 24 — Facturen te beoordelen — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Facturen te beoordelen" | ✅ | ✅ | ✅ |
| Sidebar 2 items (Te beoordelen / Alle facturen) | ✅ | ✅ | ✅ |
| Header stat "te beoordelen" | ✅ € 90.514,44 | ✅ na Bug #56 fix | ✅ |
| Stat "goedgekeurd" (BS1 extra) | ❌ | ✅ Totaal goedgekeurd | BS1+ |
| Search input | ✅ | ✅ #fact-tb-search | ✅ |
| Gearchiveerd-toggle | ✅ | ✅ #fact-tb-archived | ✅ |
| + Status filter-chip | ✅ | ✅ na Bug #55 fix (label="Status") | ✅ |
| + Periode filter-chip | ✅ | ✅ na Bug #55 fix (label="Periode") | ✅ |
| Kolommen-knop | ✅ | ✅ | ✅ |
| 7 kolommen | ✅ | ✅ | ✅ |
| Status pill "Ingediend" | ✅ | ✅ na Bug #56 normalisatie | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| 15 records te beoordelen | ✅ | ✅ na Bug #56 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #55 (UI) — Filter chips dubbele "+" prefix
- Vóór: BS1 chips toonden "+ + Status" en "+ + Periode"
- Root cause: `label` config bevatte leading "+" terwijl `renderButtonContent()` zelf de "+" toevoegt
- Fix in `facturen-te-beoordelen.js`: labels van "+ Status" → "Status" en "+ Periode" → "Periode"

### Bug #56 (data) — Status values niet genormaliseerd
- Vóór: 5 unique statuses mix Engels/Nederlands (`submitted/draft/approved/Gedeclareerd.../Betaald`)
- TODO_STATUSES (te-beoordelen filter) verwachtte "Ingediend"/"Concept" — geen match
- Page toonde 0 records ipv 15
- Fix: SQL UPDATE
  - submitted → Ingediend (15 records)
  - draft → Concept (7 records)
  - approved → Goedgekeurd (12 records)
- Resultaat: page toont 15 te beoordelen correct

## Conclusie

Module 24 is **100% functionele pariteit** met BS2 na Bug #55 + #56 fixes.
- 15/15 records "Ingediend" zichtbaar in te-beoordelen view
- Filter chips tonen correct "+ Status" / "+ Periode" labels
- Stat-cards updaten real-time

## BS1 superset
- Tweede stat-card "Totaal goedgekeurd" naast "te beoordelen"
- Sub-menu "Alle facturen" link in sidebar
- 'Periode wissen' button voor date-range reset
