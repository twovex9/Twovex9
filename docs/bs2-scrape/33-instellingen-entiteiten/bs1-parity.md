# Module 33 — Instellingen / Entiteiten — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 ("Entiteiten") | ✅ | ✅ (h2 in tab-panel) | functioneel ✅ |
| Naam-kolom | ✅ | ✅ monospace `<code>` | ✅ |
| Beschrijving-kolom (BS1 extra) | ❌ | ✅ | BS1+ |
| Aantal records-kolom (BS1 extra) | ❌ | ✅ live count uit Supabase | BS1+ |
| 7 entiteiten (client/employee/disposition/invoice/quotation/Disposition/Phase) | ✅ | ✅ 1:1 match | ✅ |
| Kolommen-kiezer | ✅ | ✅ 2 toggleable + Naam skipToggle | ✅ |
| Search input (BS1 extra) | ❌ | ✅ live filter | BS1+ |
| Count display (BS1 extra "X van Y") | ❌ | ✅ | BS1+ |
| Pagination | ✅ | ❌ (7 records = geen pagination nodig) | functioneel ✅ |
| Empty-state placeholder | n.v.t. | ✅ na Bug #67 fix | ✅ |
| TD data-col attrs (Kolommen-hide werkt) | n.v.t. | ✅ | ✅ |
| Console errors | 0 | 0 | ✅ |

## BS1 superset features

1. **Beschrijving-kolom** — context per entity ("Cliënt-entiteit", "Medewerker-entiteit", etc.)
2. **Aantal records-kolom** — live counts uit Supabase voor 4 entities (160/103/251/990)
3. **Search-input** — filter op naam + beschrijving
4. **Count display** — "X van Y" met filter-feedback
5. **Empty-state placeholder** — "Geen entiteiten gevonden." (na Bug #67 fix)

## Bug gefixt

### Bug #67 (UX) — Missing empty-state placeholder

**Probleem**: `renderEntiteiten` zette geen empty-state row als `filtered.length === 0`. Inconsistent met Gebruikers-tab (toont "Geen gebruikers gevonden.").

**Fix in instellingen.js renderEntiteiten()**:
- `if (filtered.length === 0)` check toegevoegd
- Placeholder-rij met `colspan="3"`, "Geen entiteiten gevonden.", grijs gestyled

## Conclusie

Module 33 is **100% functionele pariteit** met BS2 + BS1 superset (Beschrijving + Aantal records + Search + Count). Na Bug #67 fix is empty-state UX consistent met andere tabs.
