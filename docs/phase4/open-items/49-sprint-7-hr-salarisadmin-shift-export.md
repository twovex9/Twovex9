# Item 49 — Sprint 7: HR/Salarisadministratie — Dienst-gebaseerde export

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S7 in `../v2-master-plan.md`
**BS2 ref**: `/hr/monthly-payroll/generate-export`

## Wat is gedaan

### BS2 deep walk bevinding

BS2 `/hr/monthly-payroll/generate-export` toont:
- Tabs: **Exporteren** + **ORT Configuratie**
- Maand/Jaar dropdowns
- **Validatiestatus** sectie met per-medewerker issues (e.g. "Kilometerdeclaratie niet ingediend")
- **Twee** export-knoppen: "Export genereren" + "Dienst-gebaseerde export genereren"
- **Export geschiedenis** tabel met download-icoon per regel

### Gap-analyse BS2 ↔ BS1

| Feature | BS2 | BS1 vóór S7 | BS1 ná S7 |
|---|---|---|---|
| Tabs Exporteren + ORT | ✅ | ✅ | ✅ |
| Maand/Jaar selectors | ✅ | ✅ | ✅ |
| Validatiestatus per medewerker | ✅ | ✅ | ✅ |
| Onvolledige gegevens chip | ✅ | ✅ | ✅ |
| Export genereren (medewerker-rij) | ✅ | ✅ | ✅ |
| **Dienst-gebaseerde export** | ✅ | ❌ | ✅ |
| Exportgeschiedenis tabel | ✅ | ✅ | ✅ |
| Download per geschiedenis-rij | ✅ | ✅ | ✅ |

### Implementatie

#### `salarisadministratie-exporter.html`

Twee knoppen naast elkaar in `.sa-export-actions` wrapper:
1. **Outline-knop** "Dienst-gebaseerde export" (links) — secondary
2. **Primary knop** "Export genereren" (rechts) — bestaand

Aparte SVG icoon voor dienst-knop (table-rows symbol) om verschil met standaard download-icoon visueel te maken.

#### `salarisadministratie-exporter.js`

Nieuwe `buildShiftCsvForPeriod(period, month, year)`:
- Leest planning via `window.planningDB.getAllSync()` (fallback: localStorage `planning_items_v1`)
- Filtert op maand + jaar
- Genereert CSV met kolommen: Datum, Start, Einde, Medewerker, Diensttype, Locatie, Uren, Pauze (u), Netto uren, Tarief, Bruto
- Tarief hardcoded op €45 voor v2 (mirror BS1 default; configureerbaar in v3)
- "(open)" als teamlid leeg is
- Lege periode → "(geen diensten in deze periode)" placeholder rij

Nieuwe `generateShiftExport()`:
- Bouwt dienst-CSV
- Pusht naar history met `type: "shift"` flag + label "(dienst-gebaseerd)" achter periode
- Optional auto-download via bestaande `sa-download-now` checkbox

Wire-up: `#sa-generate-shift-btn`.click → generateShiftExport

#### `styles.css`

`.sa-export-actions` flex-wrapper voor de 2 knoppen (rechts in footer).

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅ lokaal)
- [ ] Vercel deploy slaagt
- [ ] `/salarisadministratie-exporter.html` toont 2 knoppen
- [ ] Klik "Dienst-gebaseerde export" → nieuwe regel in history met "(dienst-gebaseerd)" label
- [ ] Klik download op die regel → CSV opent in Excel met kolommen Datum/Start/Einde/etc.
- [ ] Bij periode zonder planning → CSV met "(geen diensten in deze periode)"
- [ ] Standaard "Export genereren" werkt nog steeds onveranderd

## Acceptance (master-plan S7)

- ✅ BS2 deep walk uitgevoerd op `/hr/monthly-payroll`
- ✅ Gap geïdentificeerd: Dienst-gebaseerde export ontbreekt in BS1
- ✅ Implementatie in BS1-stijl (`.btn-outline` + `.btn-primary` patroon)

## Status update bij merge

Bij merge: master-plan S7 → ✅ DONE + PR-nummer. Direct start Sprint 8 (BS2 deep walk Taken filters/statussen, 3u).
