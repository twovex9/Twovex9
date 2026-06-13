# Module 16 — Cliënten Beschikkingen — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/dispositions/overview`
**BS1 URL**: `https://futureflow-app.vercel.app/beschikkingen.html`
**Scrape datum**: 2026-05-14

## BS2 page

- title: `Beschikkingen | Embrace The Future`
- h1: **Beschikkingen**
- 99 records totaal in default-view (gefilterd op In aanvraag + Actief)

## Sidebar

Beschikkingen-group (collapsible) heeft 3 sub-items:
- Dashboard
- Overzicht ← deze module
- Facturen (Module 21)

## Toolbar

- Search-input (placeholder "Zoeken...")
- Filter-chips (4 + reset): Zorgsoort / Fase / Status / Declaratie methode / Reset
- `Kolommen` knop
- `Exporteren` knop
- `Beschikking toevoegen` (primary)

## Tabel (9 kolommen BS2)

| Kolom | Inhoud |
|---|---|
| (select) | Multi-select checkbox |
| Cliënt | Voor- + achternaam |
| Naam | Beschikking-naam (bv. "Gecombineerd") |
| Zorgsoort | Pill / link |
| Fase | Pill (Actief / Verlopen / etc.) |
| Periode | bv. "9 jan 2026 - 8 jul 2026" |
| Tarief | bv. "€ 376,19/dag" |
| Te declareren (totaal) | Numeriek |
| Declaratie methode | bv. "ONS" |

## BS1 tabel (12 kolommen — uitgebreid)

BS1 voegt 3 extra kolommen toe boven BS2:
- Te declareren LM (lopende maand)
- Nog niet gedeclareerd
- Status (betalingsstatus)
- Acties

## Toolbar BS1 extras

Beyond BS2, BS1 heeft extra filter-toggles:
- Gearchiveerd
- Verloopt binnen 60d
- Heeft te declareren lopende maand
- Heeft nog niet gedeclareerd

## BS1 modals

- `#besc-add-modal` — Beschikking toevoegen (`modal-overlay`)
- `#besc-export-modal` — Exporteren (`modal-overlay`)
- `#besc-purge-modal` — Definitief verwijderen (`modal-overlay--confirm` + slider)

## Schema

- Supabase tabel: `public.beschikkingen`
- PK: `id` (text)
- Velden: id / clientId / clientLabel / naam / zorgsoortKey / zorgsoortLabel / locatie / fase / startISO / eindISO / gearchiveerd / declMeth / teDeclarerenLM / nogNietGedeclareerd / betaaldCumulatief / betalingsStatus / tariefEur / tariefEenheid + meer
- RLS: auth-only

## Data state na Bug #43 normalisatie

- Totaal: 251 records (BS1 toont alles incl. Verlopen/In aanvraag)
- Fase distributie (4 unique):
  - Actief: 159
  - Verlopen: 71
  - In aanvraag: 19
  - In zorg: 2

BS2 default-view toont 99 (gefilterd op "In aanvraag" + "Actief") = 19 + 159 - archived = ongeveer match.

## Bugs gefixt

- **#43** (data): Fase 8 unique values → 4 unique via SQL UPDATE
  - actief→Actief, verlopen→Verlopen, in_aanvraag→In aanvraag, in_zorg→In zorg
- **#44** (UI): Add-modal Escape close-way toegevoegd
- **#45** (UI): Export-modal Escape close-way toegevoegd
- **#46** (UI): Fase dropdown options synced naar proper case (matchen DB na #43 fix)
- **#47** (UI): Zorgsoort dropdown dedup by label (was: 5x "Ambulant intern" duplicate)
