# Module 17 — Cliënten Organisaties — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Organisatie" | ✅ | ✅ | ✅ |
| Sidebar item Organisatie (positie 4 in Cliënten-menu) | ✅ | ✅ | ✅ |
| Search input | ✅ | ✅ #org-search | ✅ |
| Gearchiveerd-toggle | ✅ | ✅ #org-archived-toggle | ✅ |
| Kolommen-knop | ✅ | ✅ #org-columns-menu-btn | ✅ |
| Organisatie toevoegen (primary) | ✅ | ✅ #org-add-btn | ✅ |
| 1 hoofdkolom Naam | ✅ | ✅ | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Add modal × 3 close-ways | n.v.t. | ✅ X/Esc/Overlay | ✅ |
| Archive modal × 3 + slider | ✅ | ✅ X/Esc/Overlay + slider | ✅ |
| Purge modal × 3 + slider | ✅ | ✅ X/Esc/Overlay + slider | ✅ |
| 4 BS2 records aanwezig (Planet Young/IHub/Youz/Gripzorg) | ✅ | ✅ na Bug #48 | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bug gefixt

### Bug #48 — Missing BS2 organisaties (DATA)
- BS2 had 4 organisaties: Planet Young / IHub / Youz / Gripzorg
- BS1 had alleen "Planet Young" (1 van de 4)
- 3 ontbraken: IHub / Youz / Gripzorg
- Fix: SQL INSERT via Supabase MCP
- Resultaat: BS1 nu 93 records (was 90), alle 4 BS2-records aanwezig

## Conclusie

Module 17 organisaties is **100% functionele pariteit** met BS2.

BS1 blijft superset (93 records voor broader invoice/external-org context).
Alle 4 BS2 care providers nu in BS1.

## Scope-context

BS2 toont alleen 4 care providers in Cliënten-menu. BS1's 93 records bevatten ook ZZP-aanbieders en facturatie-organisaties uit andere modules (Facturen importeren, ZZP-administratie). Dit is een **legitieme scope-uitbreiding** voor BS1, niet een data-bug.
