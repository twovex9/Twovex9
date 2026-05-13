# Item 58 — Sprint 16: BS2 deep walk resterende modules

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S16 in `../v2-master-plan.md`

## Wat is gedaan

BS2 deep walk uitgevoerd op nog-niet-eerder-gewalked top-nav modules. Per module gap-analyse, en de gevonden gaps gedicht.

### Modules gewalked

| Module | BS2 URL | BS1 file | Status |
|---|---|---|---|
| Urenregistratie | `/time-registration/time/summary` | `werkuren.html` | ✅ Volledige parity (titel, vergrendelen, exporteren, totalen-footer) |
| Kilometers | `/mileage/declarations` | `kilometers.html` | ✅ Volledige parity (3 KPI cards, filter rij, table) |
| Verlof | `/leave-requests` | `verlof.html` | ⚪ **404 in BS2** — module bestaat niet, BS1-only feature |
| Audit | `/audit` | `audit.html` | 🟡 **Gaps gevonden** — Veroorzaker filter + Kolommen-kiezer + Reset-knop |

### Audit gaps gedicht

BS2 audit-page heeft 3 filters (Resources / Veroorzaker / Actie type) + Kolommen-knop. BS1 had alleen Resources + Actie + Search. Plus geen Reset.

**Toegevoegd**:
1. **Veroorzaker filter** (`#audit-filter-veroorzaker`) — dropdown vult zich automatisch met unieke `gebruiker` waarden uit audit-data
2. **Reset-knop** (`#audit-filter-reset`) — wist alle filters + toast feedback
3. **Kolommen-kiezer** (`#audit-columns-menu-btn`) — toggle 6 kolommen (Actie blijft altijd zichtbaar), persistent via `audit_columns_v1` localStorage
4. `data-col` attributen op alle `<th>` (zodat `.col-hidden` werkt)

### Wat NIET in scope

- Verlof migration naar BS2 (BS2 heeft het niet) — defer naar v3 als business value
- Facturen detail-page diepe inspectie — facturen-table page is al parity, detail-modal gechecked tijdens Phase 4
- Instellingen module — out of scope voor v2 (gen accountbeheer features in v2)

### Files

- `audit.html` — `.columns-dropdown` + 3 nieuwe form-elementen (Veroorzaker + Reset) + `data-col` attributen
- `audit.js` — `state.filterVeroorzaker`, `populateVeroorzakerFilter()`, reset-handler, `AUDIT_COLUMN_CONFIG` + 4 helper-functies
- _CSS_ — reuse bestaande `.columns-dropdown`, `.column-toggle*`, `.col-hidden`, `.taken-reset-btn`

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅)
- [ ] Vercel deploy slaagt
- [ ] `/audit.html` toont 4 filters in toolbar + Kolommen-knop in header
- [ ] Veroorzaker dropdown vult zich met unieke gebruikers
- [ ] Klik Reset → toast + filters leeg
- [ ] Kolommen-uncheck "Details" → kolom verdwijnt + persist over reload

## Acceptance (master-plan S16)

- ✅ Deep walk uitgevoerd op 4 nog-niet-gewalked modules
- ✅ Gap-analyse per module
- ✅ Gaps gedicht (Audit veroorzaker + kolommen + reset)
- ✅ Niet-relevante modules (Verlof = BS2 niet) gedocumenteerd

## Status update bij merge

Bij merge: master-plan S16 → ✅ DONE + PR-nummer. Direct start Sprint 18 (Final live verification, 4u). S17 (Entiteiten) skip — OPTIONEEL en user heeft niet expliciet gevraagd.
