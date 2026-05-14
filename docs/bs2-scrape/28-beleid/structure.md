# Module 28 — Beleid (Documenten) — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/documents`
**BS1 URL**: `https://besa-suite.vercel.app/beleid.html`
**Scrape datum**: 2026-05-14

## BS2 page

- h1: "Documenten"
- Header actions: Kolommen / Document uploaden / Reset
- Toolbar: zoek + reset
- Table cols: Naam / Uploaddatum / Laatst gewijzigd / Acties
- Pagination: Rows per page (10/15/30/40/50) + page-navigation (« ‹ › »)
- 25 records totaal (page 1: 09-23 reverse-sorted, page 2: 01-08 + H01 + H03)

## BS1 mirror

- h1: "Beleidsdocumenten"
- Header actions: Kolommen / + Beleidsdocument toevoegen
- Toolbar: zoek + Reset + Gearchiveerd-toggle (`.switch--yellow`)
- Table cols: **NR. / NAAM / TYPE / UPLOADDATUM / LAATST GEWIJZIGD / BESTAND / Acties**
  - BS1 superset: `NR.` + `TYPE` + `BESTAND` extra kolommen
- Pagination: Rijen per pagina (10/15/30/50) + first/prev/next/last
- 25 records (na Bug #62 import van 10 missing records)

## BS1 modals (3 totaal)

| Modal-ID | Class | Doel |
|---|---|---|
| `beleid-add-modal` | `emp-verzuim-modal-overlay` | Add/edit beleidsdocument (form: volgnummer/naam/type/bestand) |
| `beleid-archive-modal` | `modal-overlay modal-overlay--confirm` | Slider-bevestiging archiveren |
| `beleid-purge-modal` | `modal-overlay modal-overlay--confirm` | Slider-bevestiging definitief verwijderen |

Alle 3 modals (na Bug #63 fix): X / Escape / Overlay close-ways ✅

## Bug gefixt

### Bug #62 (data) — 10 missing records BS1 vs BS2

BS1 had 15 records, BS2 had 25. 10 records ontbraken:
- volgnummer 1-8: `01.Protocollen & Richtlijnen ETF`, `02.Werkwijze ETF.`, `03.Incidentensysteem link.`, `04. Ziekteprotocol loondienst`, `05. facturatieproces inhuurpersoneel`, `06. Beleidsdocument Planning`, `07. Medicatiebeleid Embrace the Future B`, `08. Beleid WLZ Ambulanten uren`
- `H01 Handboek beleid ETF versie 8.0` (volgnummer=NULL, alleen ID `bd_H01`)
- `H03.Personeelsbeleid ETF (versie 1.0 datum 15-09-2025)` (volgnummer=NULL, ID `bd_H03`)

**Fix**: SQL INSERT van 10 records in `public.beleidsdocumenten`. Type-veld (BS1-only kolom) gesteld op educated-guess (`protocol`/`beleid`/`richtlijn`/`werkwijze`/`handboek`).

### Bug #63 (UI) — 3 modals × 2 missing close-ways

`beleid-add-modal` + `beleid-archive-modal` + `beleid-purge-modal` hadden alleen X-button + Annuleren-button. **Escape** en **Overlay-click** ontbraken.

**Fix in beleid.js**: globale `initGlobalCloseForBeleidModals()`:
- Globale Escape keydown-handler die visibility detecteert per modal-type:
  - `beleid-add-modal`: `style.display === "none"`
  - `beleid-archive-modal` + `beleid-purge-modal`: `hidden`-attribuut
- Overlay-click handler per modal (`e.target === m`)
- Close mechanism per modal-type (set display="none" of set hidden + aria-hidden)

## Schema

- Hoofdtabel: `public.beleidsdocumenten`
- Storage bucket: `beleidsdocumenten` (voor bestand-uploads)
- 11 kolommen: id (text PK) / volgnummer / naam / type / uploaddatum / laatst_gewijzigd / archived / file_name / file_mime / file_size / storage_path
- 25 records actief (na Bug #62 import)
