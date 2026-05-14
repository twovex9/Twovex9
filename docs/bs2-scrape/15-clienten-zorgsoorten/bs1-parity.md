# Module 15 — Cliënten Zorgsoorten — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Zorgsoorten" | ✅ | ✅ | ✅ |
| Sidebar positie 2 in Cliënten | ✅ | ✅ | ✅ |
| Search input | ✅ | ✅ #zs-search | ✅ |
| Gearchiveerd-toggle | ✅ | ✅ #zs-archived-toggle | ✅ |
| Kolommen-knop | ✅ | ✅ #zs-columns-menu-btn | ✅ |
| `+ Zorgsoort toevoegen` (primary) | ✅ | ✅ #zs-add-btn | ✅ |
| 2 kolommen Naam + Tarieftype | ✅ | ✅ | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Tarieftype display "Week/Uur/Dag" | ✅ | ✅ via JS render | ✅ |
| Add modal × 3 close-ways | n.v.t. (BS2 page) | ✅ X/Esc/Overlay | ✅ |
| Archive modal × 3 + slider | ✅ | ✅ X/Esc/Overlay + slider | ✅ |
| Purge modal × 3 + slider | ✅ | ✅ X/Esc/Overlay + slider | ✅ |
| Data: 6 records | ✅ | ✅ na Bug #41 cleanup | ✅ |
| Naam "WLZ" uppercase | ✅ | ✅ na Bug #42 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #41 — Test record cleanup (DATA)
- BS1 had 7 records (een extra "test" record). BS2 toonde 6 records.
- Fix: SQL DELETE via Supabase MCP — `DELETE FROM zorgsoorten WHERE naam = 'test'`
- Resultaat: 7 → 6 records, matches BS2 exact

### Bug #42 — Spelling normalisatie (DATA)
- BS1: "Wlz" (mixed case)
- BS2: "WLZ" (uppercase)
- Fix: SQL UPDATE — `UPDATE zorgsoorten SET naam='WLZ' WHERE naam='Wlz'`
- Resultaat: naam matches BS2 spelling

## Conclusie

Module 15 zorgsoorten is **100% pariteit** met BS2 na Bug #41 + #42 fixes.
- 6/6 records identiek
- Alle features functioneel
- 9/9 modal × close-ways verified

## Data details

| Naam | Tarieftype | bs1 | bs2 |
|---|---|---|---|
| Ambulant extern | uur (display "Uur") | ✅ | ✅ |
| Ambulant intern | uur | ✅ | ✅ |
| Fasewonen | dag | ✅ | ✅ |
| Gecombineerd | week | ✅ | ✅ |
| Verblijf en behandeling | dag | ✅ | ✅ |
| WLZ | uur | ✅ na Bug #42 | ✅ |
