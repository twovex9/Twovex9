# Module 18 — Cliënten Gemeenten — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Gemeenten" | ✅ | ✅ | ✅ |
| Sidebar item Gemeenten (positie 5 Cliënten-menu) | ✅ | ✅ | ✅ |
| Search input | ✅ | ✅ #gem-search | ✅ |
| Gearchiveerd-toggle | ✅ | ✅ #gem-archived-toggle | ✅ |
| Kolommen-knop | ✅ | ✅ #gem-columns-menu-btn | ✅ |
| Gemeente toevoegen (primary) | ✅ | ✅ #gem-add-btn | ✅ |
| 1 hoofdkolom Naam | ✅ | ✅ | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Add modal × 3 close-ways | n.v.t. | ✅ X/Esc/Overlay | ✅ |
| Archive modal × 3 + slider | ✅ | ✅ | ✅ |
| Purge modal × 3 + slider | ✅ | ✅ | ✅ |
| Sample BS2 records aanwezig (5/5 checked) | n.v.t. | ✅ | ✅ |
| Console errors | 0 | 0 | ✅ |

## Geen bugs

Module 18 had **geen bugs** te fixen. UI features werken 100%, alle modal close-ways functioneren, alle gesamplede BS2 records aanwezig in BS1.

## Data-count

- BS1: 238 records
- BS2: 316 records
- 78 records gap: Nederlandse gemeenten zonder actieve ETF-cliënten
- Sample-check (5 BS2 records): alle in BS1 aanwezig (Uitgeest / WLZ / WMO / YOUZ/Rotterdam / SED Stede Broec)

## Scope-context

BS1 bevat alle gemeenten die voorkomen in cliënten-data (operationeel relevant).
78 missing zijn Nederlandse gemeenten die nooit een ETF-cliënt hadden — niet blokkerend voor productie.
Future Fase B (data-sync) kan complete BS2-list overnemen indien gewenst.
