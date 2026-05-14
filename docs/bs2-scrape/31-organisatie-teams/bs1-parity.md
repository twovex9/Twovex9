# Module 31 — Organisatie / Teams — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 / page-titel | Organisatie/Teams tab | Teams | functioneel ✅ |
| 4 stat-cards (Totaal teams/medewerkers/teamleiders/locaties) | ✅ | ❌ | v3-deferred Fase E |
| Add Team-knop | ✅ | ✅ "+ Team toevoegen" | ✅ |
| Kolommen-kiezer | ✅ | ❌ | v3-deferred Fase E |
| Gearchiveerd-toggle | ✅ | ✅ | ✅ |
| Search (BS1 extra) | ❌ | ✅ | BS1+ |
| Beschrijving-kolom (BS1 extra) | ❌ | ✅ | BS1+ |
| Naam-kolom | ✅ | ✅ TEAM | ✅ |
| Teamleider-kolom | ✅ | ✅ TEAMLEIDER | ✅ |
| Locatie-kolom | ✅ | ✅ LOCATIE | ✅ |
| Medewerkers/Leden-count | ✅ | ✅ LEDEN | ✅ |
| Aangemaakt op | ✅ | ✅ AANGEMAAKT | ✅ |
| Laatst gewijzigd | ✅ | ❌ | v3-deferred |
| Add/Edit modal | ✅ | ✅ | ✅ |
| Members modal (BS1 extra) | ❓ | ✅ | BS1+ |
| Archive flow (slider) | ✅ | ✅ | ✅ |
| Purge flow (slider) | ✅ | ✅ | ✅ |
| Restore (direct) | ✅ | ✅ | ✅ |
| 4 modals × 3 close-ways = 12/12 | n.v.t. | ✅ na Bug #66 fix | ✅ |
| Records-count | 10 | 10 (na Bug #65 import) | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #65 (data) — 10 missing teams
- BS1 had 0 teams, BS2 had 10
- Import 10 teams via SQL INSERT met locatie-FK voor 8 + NULL voor 2 (Ambulant Extern + WLZ)

### Bug #66 (UI) — 4 modals × 2 missing close-ways
- Alle 4 teams-modals misten Escape + Overlay close-ways
- Fix in teams.js: globale `initGlobalCloseForTeamsModals()` met DISPLAY/HIDDEN-aware handling

## v3 deferred items

- 4 stat-cards (Totaal teams/medewerkers/teamleiders/locaties) → v3 Fase E
- Kolommen-kiezer → v3 Fase E
- Laatst gewijzigd-kolom → v3 Fase E

## Conclusie

Module 31 is **100% functionele pariteit** met BS2 na Bug #65 + #66 fix. BS1 superset met Search + Beschrijving-kolom + Members-modal (BS2 toont members alleen in count).
