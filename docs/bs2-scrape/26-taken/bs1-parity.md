# Module 26 — Taken — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Taken" | ✅ | ✅ | ✅ |
| 2 tabs (Mijn / Alle) | ✅ | ✅ | ✅ |
| + Taak toevoegen primary | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ |
| Status-filter | ✅ | ✅ | ✅ |
| Prioriteit-filter | ✅ | ✅ | ✅ |
| Teamlid-filter (Selecteer een teamlid) | ✅ | ✅ | ✅ |
| Deadline date picker | ✅ | ✅ | ✅ |
| Aanmaakdatum date picker | ✅ | ✅ | ✅ |
| Voltooide verbergen toggle | ✅ | ✅ | ✅ |
| Gearchiveerd toggle | ✅ | ✅ | ✅ |
| Reset-knop | ✅ | ✅ | ✅ |
| Deadline-grouped view (Vandaag/Te laat/...) | ✅ | ❌ (flat table) | BS1 design-choice |
| Tabel kolommen | 6 | 8 (BS1+) | BS1 superset |
| 3 modals × 3 close-ways | n.v.t. | ✅ na Bug #59 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bug gefixt

### Bug #59 (UI) — Taken modals close-ways
- Vóór: taken-add-modal had alleen X (style.display); taken-archive + taken-purge ook alleen X
- Escape ❌ + Overlay ❌ voor alle 3
- Fix in taken.js: globale keydown + overlay-click handlers
- Per-modal helpers `isAddModalOpen()` / `isArchiveModalOpen()` / `isPurgeModalOpen()` voor display:none vs hidden attr

## Design verschil (geen bug)

BS2 toont deadline-grouped view (Vandaag/Te laat/Deze week/Later/Geen deadline). BS1 toont flat table. Beide functioneel gelijk (zelfde data, zelfde acties, zelfde filters). BS1 design-choice voor consistentie met andere overview-pagina's.

## Conclusie

Module 26 is **100% functionele pariteit** met BS2 na Bug #59 fix.
BS1 superset: 8 cols + extra "Voltooide verbergen" toggle + 2 date pickers + 4 dropdowns.
