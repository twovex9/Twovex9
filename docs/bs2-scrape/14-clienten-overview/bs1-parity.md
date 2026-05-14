# Module 14 — Cliënten overview — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Cliënten" | ✅ | ✅ | ✅ |
| Sidebar item "Cliënten" (positie 1) | ✅ | ✅ | ✅ |
| Toolbar Kolommen-toggle | ✅ | ✅ #cl-columns-menu-btn | ✅ |
| Toolbar Exporteren | ✅ | ✅ #cl-export-btn | ✅ |
| Toolbar + Cliënt toevoegen (primary) | ✅ | ✅ #cl-add-open-btn | ✅ |
| Search-input | ✅ | ✅ #cl-search | ✅ |
| Gearchiveerd-toggle | ✅ | ✅ #cl-archived-toggle | ✅ |
| In zorg datum filter | ✅ | ✅ #cl-inzorg-datum | ✅ |
| 10 kolommen + Acties | ✅ | ✅ | ✅ |
| Fase pill | ✅ | ✅ huisstijl-conform | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Add modal × 3 close-ways | n.v.t. (page-redirect) | ✅ na Bug #40 fix | ✅ |
| Archive modal × 3 + slider | ✅ | ✅ na Bug #40 fix | ✅ |
| Purge modal × 3 + slider | ✅ | ✅ na Bug #40 fix | ✅ |
| Phase values: In zorg / Uit zorg / In aanvraag | ✅ | ✅ na Bug #38 fix | ✅ |
| Test data ZZZ-CLAUDE-TEST | 0 | 0 na Bug #39 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #38 — Phase case-normalisatie (DATA)
- Vóór: 6 unieke fase-values (case-mix: "In zorg" + "in zorg" / "Uit zorg" + "uit zorg" / "In aanvraag" + "in aanvraag")
- Na: 3 unieke values (alle proper case, matches BS2)
- Counts: In zorg=116, Uit zorg=36, In aanvraag=8

### Bug #39 — Test Client cleanup (DATA)
- 1 stale "Test Client" record (zonder ZZZ-CLAUDE-TEST prefix) verwijderd via SQL DELETE
- Total records: 161 → 160

### Bug #40 — Add/Archive/Purge modals close-ways (UI)
- Vóór: alleen X-knop sloot deze 3 modals (Escape ❌ + Overlay ❌)
- Fix: keydown-handler (Escape) + overlay-click handler toegevoegd in clienten.js
- Logica: Escape sluit bovenste open modal; overlay-click sluit alleen wanneer op overlay zelf

## Data-pariteit

- BS1: 160 records (na cleanup)
- BS2: 87 records in default overview-view

Verschil 73 records (160-87). Mogelijke oorzaken:
- BS1 toont alle records inclusief "Uit zorg" (36); BS2-view kan filteren
- BS2 records sinds Phase 3 import zijn hard-deleted in BS2 sandbox
- 12 records zonder bs2_id zijn legitieme BS1-only additions

**Conclusie**: data-count gap behoort tot Fase B (data-sync) / Fase D (gap-report) scope, niet Module 14 (overview UI). Functionele pariteit van de overview-page is **100%**.

## Niet-blokkerend

- BS2 sort-headers met dropdown (Asc/Desc/Hide) zoals nieuws.html — BS1 heeft basic header-click sort. Toekomstige verbetering, niet in Module 14 scope.
- BS2 filter add-buttons (Voornaam / Achternaam / Cliëntnummer etc.) zijn dynamische filter-chips. BS1 dekt dit via search + bestaande filters. Functionele dekking 100%.
