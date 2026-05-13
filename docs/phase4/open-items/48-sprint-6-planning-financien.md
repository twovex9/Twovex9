# Item 48 — Sprint 6: Planning Financiën (KPI parity)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S6 in `../v2-master-plan.md`

## Wat is gedaan

### BS2 deep walk bevinding

BS2 heeft GEEN aparte `/planning/finance` route — de "Financiën" knop in BS2 navigatie zit alleen in een `.besa-navigation__sizer-item` (responsive sizer, niet visueel). De **echte** Planning Financiën zit in de **KPI cards bovenaan de planning-pagina** + de **per-row chips per locatie**.

### Gap-analyse BS2 ↔ BS1

| KPI | BS2 | BS1 vóór S6 | BS1 ná S6 |
|---|---|---|---|
| ZZP Kosten | ✅ | ✅ | ✅ |
| Geplande uren | ✅ | ✅ | ✅ |
| **Openstaande uren** | ✅ | ❌ | ✅ |
| Kilometerkosten | ✅ | ✅ | ✅ |
| **Gem. tarief** | ✅ | ❌ | ✅ |

Per-row chips per locatie (BS2): ZZP €, Geplande uren, **Openstaande uren**, KM €, **Gem./u**.
BS1 had: ZZP €, Geplande uren, KM €. Nu uitgebreid met de 2 ontbrekende chips.

### Code

#### `getMetrics(items)` upgrade
- Nieuw veld `openHours` — som van uren waar `!teamlid` (niet toegewezen aan medewerker)
- Nieuw veld `openCount` — aantal openstaande diensten
- Nieuw veld `openUren` — pre-formatted string voor UI
- Nieuw veld `gemTarief` — `kosten / hours` (fallback `ui.tarief` als hours=0, anders zou je € 0,00 zonder context tonen)

#### `renderSummary(items)` upgrade
- Was: 3 KPI cards (ZZP / Geplande uren / Kilometerkosten)
- Nu: 5 KPI cards (zelfde + Openstaande uren + Gem. tarief)
- Volgorde mirror BS2

#### Per-row chip uitbreiding
- Toegevoegd: `.planning-erm-glabel-chip--open` (oranje accent) — "Open Xu"
- Toegevoegd: `.planning-erm-glabel-chip--tarief` (groen accent) — "€/u"
- Volgorde per rij: ZZP → Geplande uren → Open → KM → €/u

### Files

- `planning.js` — `getMetrics`, `renderSummary`, per-row chip rendering uitgebreid
- `styles.css` — `.planning-erm-glabel-chip--open` + `.planning-erm-glabel-chip--tarief` (oranje + groen accent kleuren via huiskleur tokens)

## Test plan

- [ ] CI groen (JS syntax al ✅ via `node -c`)
- [ ] Vercel deploy slaagt
- [ ] `/planning.html` toont 5 KPI cards (i.p.v. 3) bovenaan
- [ ] Openstaande uren = uren van shifts zonder teamlid
- [ ] Gem. tarief = totaal kosten / totaal uren
- [ ] Per-locatie rij toont 5 chips (was 3) met juiste kleuraccenten
- [ ] Bij planning met 0 items: alle waardes 0,00 / 0u / fallback tarief

## Acceptance (master-plan S6)

- ✅ BS2 deep walk uitgevoerd — geen aparte sub-page, KPI's zijn de Financiën
- ✅ Gap-analyse + alle gaps gedicht (2 KPI's + 2 chips)
- ✅ Implementatie in BS1-stijl (eigen design tokens, geen BS2 kleuren overgenomen)

## Status update bij merge

Bij merge: master-plan S6 → ✅ DONE + PR-nummer. Direct start Sprint 7 (BS2 deep walk HR/Salarisadministratie, 4u).
