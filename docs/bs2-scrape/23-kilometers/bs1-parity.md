# Module 23 — Kilometers — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Kilometer declaraties" | ✅ | ✅ | ✅ |
| 3 stat-cards (Totale declaraties / afstand / vergoeding) | ✅ | ✅ | ✅ |
| Search input | ✅ | ✅ #km-search | ✅ |
| Maand-filter | ✅ | ✅ #km-filter-maand | ✅ |
| Jaar-filter | ✅ | ✅ #km-filter-jaar | ✅ |
| Reset-knop | ❌ | ✅ #km-filter-reset | BS1+ |
| Kolommen-knop | ✅ | ✅ #km-columns-menu-btn | ✅ |
| Exporteren-knop | ❌ | ✅ #km-export-btn | BS1+ |
| ⊕ Toevoegen (primary) | ❌ | ✅ #km-add-open-btn | BS1+ |
| 6 kolommen | ✅ | ✅ | ✅ |
| Multi-add (manual + kantoor) | ❌ | ✅ via km-add-choice-modal | BS1+ |
| Add-choice modal × 3 close-ways | n.v.t. | ✅ na Bug #54 fix | ✅ |
| Add-manual modal × 3 close-ways | n.v.t. | ✅ na Bug #54 fix | ✅ |
| Add-kantoor modal × 3 close-ways | n.v.t. | ✅ na Bug #54 fix | ✅ |
| Edit-modal × 3 close-ways | n.v.t. | ✅ na Bug #54 fix | ✅ |
| Purge-modal × 3 close-ways + slider | ✅ | ✅ na Bug #54 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #53 (data, gedocumenteerd, Fase B/D scope)
- BS1 `kilometer_declaraties` table = 0 records
- BS2 toont 16 records
- Phase 3 data-import had geen kilometers
- Niet blokkerend voor Module 23 UI functionaliteit
- Future Fase B-sync zal de 16 records overnemen

### Bug #54 (UI fix in deze module)
- 5 modals hadden Escape close-way niet geïmplementeerd
- Fix in `kilometers.js`: globale keydown-handler scant alle 5 modal-IDs in volgorde
- Prioriteit: purge > edit > kantoor > manual > choice
- Alle 3 close-ways (X / Escape / Overlay) werken nu voor elke modal

## Conclusie

Module 23 is **100% functionele pariteit** met BS2 na Bug #54 fix.
BS1 is **superset** met meer features:
- 2 add-types (Handmatig + Kantoor-route via choice-modal)
- Exporteren naar CSV
- Reset-knop voor filters
- 5 modals voor verschillende workflows

Data-count gap (#53) niet kritiek — toekomstige sync zal het oplossen.
