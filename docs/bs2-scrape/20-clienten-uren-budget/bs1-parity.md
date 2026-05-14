# Module 20 — Uren budgetering — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Uren budgetering" | ✅ | ✅ na Bug #50 fix | ✅ |
| Subtitle "Configureer standaard uren..." | ✅ | ✅ | ✅ |
| Cliënt-selector dropdown | ✅ | ✅ #ub-sel-client | ✅ |
| Jaar-selector | ✅ | ✅ #ub-sel-year (2024/2025/2026) | ✅ |
| Banner "Selecteer cliënt om verder te gaan" | ✅ | ✅ | ✅ |
| 52 weken rijen | ✅ | ✅ | ✅ |
| Kolom "Weken" met datum-range | ✅ | ✅ | ✅ |
| Kolom "Standaard uren" editable | ✅ | ✅ | ✅ |
| Kolommen-knop | ✅ | ✅ #ub-columns-menu-btn | ✅ |
| Bulk bewerken (BS1 extra) | n.v.t. | ✅ #ub-bulk-start | BS1+ |
| Console errors | 0 | 0 | ✅ |

## Bug gefixt

### Bug #50 — Spelling display label (UI)
- **Vóór** (BS1): "Uren bud**g**ettering" (double 't')
- **BS2**: "Uren bud**g**etering" (single 't')
- **Fix**: 19 HTML files (sidebar links) + uren-budgettering.html (title + h1) display-tekst aangepast
- **Filename behouden**: `uren-budgettering.html` blijft (geen breaking change in JS imports / top-nav-overflow.js / uren-budgettering.js)

## Conclusie

Module 20 uren-budgetering is **100% functionele pariteit** met BS2 na Bug #50 spelling fix.
BS1 heeft een **Bulk bewerken** feature die BS2 niet heeft — legitieme BS1 superset.

## Data context

Page is configurable per client × jaar. Default state = "Selecteer cliënt".
Database tabel `public.uren_budget` houdt weekly hour budgets per client.
