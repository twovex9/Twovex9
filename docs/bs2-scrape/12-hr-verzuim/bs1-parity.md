# Module 12 — HR Verzuim — BS1 PARITY

**Datum**: 2026-05-14
**BS2**: `/hr/all-sickness`
**BS1**: `verzuim.html`

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| Top-level sidebar item "Verzuim" | ✅ na Verlof-groep | ❌ genest onder Compensatie | 🟡 **Bug #33** |
| h1 "Lange termijn afwezigheid" | ✅ | ✅ | ✅ |
| Tab "Lange termijn" | ✅ | ✅ vz-tab-lang | ✅ |
| Tab "Korte termijn" | ✅ | ✅ vz-tab-kort | ✅ |
| Kolom Medewerker | ✅ | ✅ | ✅ |
| Kolom Eerste ziektedag | ✅ | ✅ | ✅ |
| Kolom Verwachte terugkeerdatum | ✅ | ✅ | ✅ |
| Kolom Werkelijke terugkeerdatum | ✅ | ✅ | ✅ |
| Kolom Beschrijving | ✅ | ✅ | ✅ |
| Kolom Status | ✅ | ✅ | ✅ |
| Kolom Acties | ✅ | ✅ | ✅ |
| Search-input | ✅ | ✅ #vz-search | ✅ |
| Kolommen-toggle (panel) | ✅ | ✅ 7 toggles | ✅ |
| Edit-modal | ✅ | ✅ #vz-edit-modal | ✅ |
| Edit-modal X-close | ✅ | ✅ | ✅ |
| Edit-modal Escape-close | ✅ | ✅ | ✅ |
| Edit-modal Overlay-close | ✅ | ✅ | ✅ |
| Delete-modal | ✅ | ✅ #vz-delete-modal | ✅ |
| Delete-modal slider-confirm | ✅ | ✅ | ✅ |
| Delete-modal X-close | ✅ | ✅ | ✅ |
| Delete-modal Escape-close | ✅ | ✅ | ✅ |
| Delete-modal Overlay-close | ✅ | ✅ | ✅ |
| CRUD via medewerker-detail | ✅ | ✅ | ✅ (Module 27 scope) |
| Console errors | 0 | 0 | ✅ |

## Bugs / Gaps

### Bug #33 — Sidebar position
- **Probleem**: BS1 toont Verzuim als genest sub-item onder Compensatie-groep
- **BS2 gedrag**: Verzuim is een top-level item in HR-sidebar (na Verlof-groep)
- **Fix**: Verzuim uit Compensatie-panel halen + als directe `.side-link` na de Verlof-groep plaatsen in alle 19 HR-pagina's
- **Categorie**: structural (UI-pariteit)
- **PR**: pending

## Conclusie

Module 12 verzuim is **functioneel 100% pariteit** met BS2 (CRUD, modals, tabs, kolommen, slider-confirm).
Eén structureel gap: Bug #33 sidebar-relocation. Na fix = 100% pariteit.

## Data-pariteit

- BS1: 11 lange-termijn + 3 korte-termijn = 14 records totaal
- BS2: niet via UI te tellen zonder admin-rol switch (later in Fase F)
- Eerdere Phase 3 import: verzuim totaal 14 records → matches BS1 huidig
