# Item 47 — Sprint 5: Planning Exporteren CSV

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S5 in `../v2-master-plan.md`
**BS2 ref**: `/planning/overview` → sidebar "Exporteren" knop

## Wat is gedaan

BS1 krijgt een sidebar Exporteren-knop voor de huidige zichtbare planning (na alle filters). Klik → format-keuze modal (CSV / TXT / XLS / PDF) via bestaande `window.ffExport` helper.

### UI

- Nieuwe knop `#planning-sidebar-export-btn` in `planning.html` sidebar tussen het search-veld en de "Filters wissen" link
- Download-icoon links + label "Exporteren"
- Visueel: outline-knop met blauwe hover-state (consistent met `.btn-outline`)

### JS

`exportPlanningCsv()` upgraded van directe Blob-download → `ffExport`-call:
- Pakt `getItemsForView()` (huidige filters + view-mode)
- Mapt naar user-friendly NL kolommen: Datum, Start, Einde, Diensttype, Functie, Teamlid, Cliënt, Afdeling, Vestiging, Locatie, Uren, Tarief
- Filename bevat periode-info: `planning-week-21.csv` of `planning-2026-05.csv` of `planning-2026-05-13.csv`
- Fallback: directe CSV-download als `ffExport` niet geladen is

### Files

- `planning.html` — nieuwe `<button id="planning-sidebar-export-btn">` met SVG download-icoon
- `planning.js` — `exportPlanningCsv` upgraded + nieuwe event listener voor sidebar-knop
- `styles.css` — `.planning-erm-export-btn`, `.planning-erm-export-ico`

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅ lokaal)
- [ ] Vercel deploy slaagt
- [ ] Klik "Exporteren" → modal met 4 format-opties
- [ ] CSV-download bevat NL-headers + huidige zichtbare items
- [ ] Filename: `planning-week-NN.csv` (in week-view) / `planning-YYYY-MM.csv` (month) / datum (day)
- [ ] Lege view → "Geen gegevens" feedback (geen lege download)
- [ ] Andere formats (TXT/XLS/PDF) werken via dezelfde ffExport helper

## Acceptance (master-plan S5)

- ✅ JS-functie die zichtbare shifts filtert + CSV genereert
- ✅ UI: knop in sidebar (BS2-locatie)
- ✅ Download via Blob + DOM `<a download>`

## Status update bij merge

Bij merge: master-plan S5 → ✅ DONE + PR-nummer. Direct start Sprint 6 (BS2 deep walk Planning Financiën sub-page, 4u).
