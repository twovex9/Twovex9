# Module 25 — Facturen alle — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Alle facturen" | ✅ | ✅ na Bug #57 | ✅ |
| Sidebar 2 items (Te beoordelen / Alle facturen) | ✅ | ✅ | ✅ |
| Tabel kolommen basis (7) | ✅ | ✅ + 3 extra (BS1+) | ✅ |
| Search input | n.v.t. | ✅ BS1+ | BS1+ |
| Filter Status | ✅ (chip) | ✅ dropdown | ✅ |
| Filter Periode | ✅ (chip) | ✅ dropdown | ✅ |
| Filter Declaratie methode | ❌ | ✅ BS1+ | BS1+ |
| Filter Betaald | ❌ | ✅ BS1+ | BS1+ |
| Verloopt binnen 60d toggle | ❌ | ✅ BS1+ | BS1+ |
| Gearchiveerd-toggle | ❌ | ✅ BS1+ | BS1+ |
| Reset-knop | ✅ | ✅ | ✅ |
| Kolommen-knop | ✅ | ✅ | ✅ |
| Exporteren | ❌ | ✅ BS1+ | BS1+ |
| + Factuur aanmaken | ❌ | ✅ BS1+ | BS1+ |
| Add-modal × 3 close-ways | n.v.t. | ✅ na Bug #58 | ✅ |
| Export-modal × 3 close-ways | n.v.t. | ✅ na Bug #58 | ✅ |
| Arch-modal × 3 close-ways + slider | ✅ | ✅ | ✅ |
| Purge-modal × 3 close-ways + slider | ✅ | ✅ | ✅ |
| Status pills proper case | ✅ | ✅ (na Module 24 Bug #56) | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #57 (UI) — h1 label
- Vóór: BS1 h1 "Facturen", BS2 h1 "Alle facturen"
- Fix: facturen.html line 120 → "Alle facturen"

### Bug #58 (UI) — Escape close-way 2 modals
- fact-add-modal en fact-export-modal sloten alleen via X + Overlay
- Fact-arch + fact-purge hadden al Escape (in keydown-handler)
- Fix: keydown-handler uitgebreid met add + export modal-checks

## Conclusie

Module 25 is **100% functionele pariteit** met BS2 na Bug #57 + #58 fixes.
BS1 is **uitgebreid superset** met 8 extra features (Search / 4 filter-toggles+dropdowns / Reset / Exporteren / Add-button).
