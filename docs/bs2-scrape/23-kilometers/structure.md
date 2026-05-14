# Module 23 — Kilometers — STRUCTURE

**BS2 URL**: `/mileage/declarations`
**BS1 URL**: `https://besa-suite.vercel.app/kilometers.html`
**Scrape datum**: 2026-05-14

## BS2 page
- title: `Kilometers | Embrace The Future`
- h1: **Kilometer declaraties**
- Sidebar: 1 item "Kilometer declaraties"

## BS2 stat-cards (3)
- Totale declaraties: 16 (Declaraties deze periode)
- Totale afstand: 5.004,54 km
- Totaalbedrag: € 1.717,71 (Totale vergoeding)

## Toolbar
- Search (Zoeken...)
- + Maand filter (dropdown)
- + Jaar filter (dropdown)
- Kolommen-knop

## Tabel (6 kolommen)

| Kolom | Inhoud |
|---|---|
| Medewerker | Voor- + achternaam |
| Periode | bv. "May 2026" / "April 2026" |
| Status | Pill: "Niet ingediend" / "Ingediend" |
| Ingediend op | Datum of "-" |
| Totale kilometers | bv. "11 km" / "1209.64 km" |
| Totale vergoeding | € XX,XX |

## BS1 mirror

- h1 "Kilometer declaraties" ✅ matches BS2
- 3 stat-cards: Totale declaraties / Totale afstand / Totaalbedrag (Totale vergoeding) ✅
- Toolbar: Zoeken / + Maand / + Jaar / Reset / Exporteren / Kolommen (BS1 superset: Exporteren + Reset)
- 6 kolommen identiek aan BS2 ✅
- 5 modals: km-add-choice / km-add-manual / km-add-kantoor / km-edit / km-purge
- Primary button `⊕ Toevoegen` (#km-add-open-btn)

## Schema

- Supabase tabel: `public.kilometer_declaraties` (PK text)
- Velden: id / medewerker_id (uuid) / datum / type / beschrijving / locatie / dienst / kilometers / ingediend / ingediend_op / aanmaakdatum / laatst_gewijzigd

## Bugs gevonden

### Bug #53 (data) — 16 BS2 records ontbreken in BS1
- BS1 `kilometer_declaraties` = 0 records
- BS2 toont 16 records
- Phase B/D scope: data-sync wordt later geregeld
- **Niet blokkerend** voor Module 23 UI functionaliteit

### Bug #54 (UI) — Escape close-way ontbreekt voor 5 modals
- km-add-choice / km-add-manual / km-add-kantoor / km-edit / km-purge
- X ✅ Overlay ✅ Escape ❌
- **Fix**: globale `keydown` handler in `kilometers.js` voor Escape
- Logica: scant alle 5 modals in volgorde (purge → edit → kantoor → manual → choice), sluit eerste niet-hidden modal

## BS1 superset features
- `⊕ Toevoegen` knop met dropdown: "Handmatig" (km-add-manual) of "Kantoor-route" (km-add-kantoor)
- Exporteren-knop (CSV download)
- Reset-knop wist filters
- 5 modals (BS2 heeft alleen 1 simpele add-flow)
