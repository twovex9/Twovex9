# Module 22 — Incidenten — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Incidenten overzicht" | ✅ | ✅ | ✅ |
| Sidebar item Incidenten (group met sub-items) | ✅ | ✅ | ✅ |
| 2 tabs "Mijn cliënten" / "Alle incidenten" | ✅ | ✅ .incident-tab | ✅ |
| Search input | ✅ | ✅ #inc-search | ✅ |
| Filter Status | ✅ | ✅ #inc-filter-status | ✅ |
| Filter Locatie | ✅ | ✅ #inc-filter-locatie | ✅ |
| Filter Medewerker | ✅ | ✅ #inc-filter-medewerker | ✅ |
| Filter Categorie | ✅ | ✅ #inc-filter-categorie | ✅ |
| Filter Cliënt | ✅ | ✅ #inc-filter-client | ✅ |
| Filter Datum bereik | ✅ | ✅ #inc-filter-datum-van + -tot | ✅ |
| Kolommen-knop | ✅ | ✅ #inc-columns-menu-btn | ✅ |
| Incident melden (primary) | ✅ | ✅ #inc-add-open-btn → incident-melden.html | ✅ |
| 8 kolommen | ✅ | ✅ | ✅ |
| Status display "In afwachting" etc. | ✅ | ✅ proper case via dropdown labels | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Archive-modal × 3 close-ways + slider | ✅ | ✅ #inc-archive-modal | ✅ |
| Purge-modal × 3 close-ways + slider | ✅ | ✅ #inc-purge-modal | ✅ |
| Incident creation via dedicated page | ✅ | ✅ incident-melden.html | ✅ |
| Console errors | 0 | 0 | ✅ |

## Geen bugs

Module 22 had **geen bugs** te fixen. Functioneel 100% pariteit met BS2.

## Notitie kolom-naam "Gemeldt" vs "Gemeld"

BS2 toont "Gemeldt door" (typo extra 't'). BS1 toont "Gemeld door" (correct Dutch).
Voor 100% LETTERLIJK pariteit is dit technisch een verschil — maar BS2's spelling is een **typo**, BS1's is correct Dutch.
**Beslissing**: BS1's correcte spelling behouden — typo's overnemen is geen reden voor strict pariteit.

## Status storage vs display

- Database storage: snake_case (`in_afwachting`/`in_behandeling`/`opgelost`)
- UI display: proper case ("In afwachting"/"In behandeling"/"Opgelost") via dropdown option-text
- Geen visibility-issue voor user

## Data context

- 144 records totaal, alle status="in_afwachting" (display "In afwachting")
- 11 unique categories
- BS2 default-view filters op "Mijn cliënten" = 0 records voor huidige user

## Conclusie

Module 22 is **100% functionele pariteit** met BS2. Geen bugs, geen code-changes nodig.
BS1 incident-melden.html is robuust full-page form (vergelijkbaar met BS2 detail-page voor incident creation).
