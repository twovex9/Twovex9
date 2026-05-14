# Module 27 — Medewerker-detail — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 dynamic per medewerker | ✅ | ✅ | ✅ |
| Sidebar card (photo/name/email/contact/adres) | ✅ | ✅ | ✅ |
| Tab Details | ✅ | ✅ | ✅ |
| Tab Professioneel | ✅ | ✅ | ✅ |
| Tab Opleiding | ✅ | ✅ | ✅ |
| Tab Notities | ✅ | ✅ | ✅ |
| Tab Documenten | ✅ | ✅ | ✅ |
| Tab Verzuim | ✅ | ✅ | ✅ |
| Tab Verlof (BS1 extra) | ❌ | ✅ | BS1+ |
| Form velden Medewerker gegevens | ✅ | ✅ | ✅ |
| Form velden Adres | ✅ | ✅ | ✅ |
| Form velden Dienstverband | ✅ | ✅ | ✅ |
| Wijzigingen opslaan per sectie | ✅ | ✅ | ✅ |
| Inloggen als Medewerker | ✅ | ✅ | ✅ |
| Planningstatus toggle | ✅ | ✅ | ✅ |
| Waarschuwingen panel | ✅ | ✅ | ✅ |
| 4 modals × 3 close-ways | n.v.t. | ✅ na Bug #61 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bug gefixt

### Bug #61 (UI) — 4 modals close-ways defensieve fallback
- emp-doc-modal + emp-doc-delete-modal hadden lazy-wire close-handlers (only initialized if doc-tab opened with selected medewerker)
- emp-verzuim-modal + emp-verlof-overd-modal misten Escape close-way
- **Fix in medewerker.js**: `initGlobalEscapeForEmpModals()` globale defensieve init voor alle 4 modals:
  - Globale Escape keydown-handler (display !== "none" check)
  - Defensieve overlay-click handler per modal
  - Defensieve X-close handler per modal

## Conclusie

Module 27 is **100% functionele pariteit** met BS2 na Bug #61 fix.
BS1 superset: extra "Verlof"-tab + Overige informatie + Verjaardag in sidebar.
