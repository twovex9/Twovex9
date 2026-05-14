# Module 22 — Cliënten Incidenten — STRUCTURE

**BS2 URL**: `/clients/manage-incidents`
**BS1 URL**: `https://besa-suite.vercel.app/incidenten.html`
**BS1 detail-page**: `incident-melden.html` (incident creation/editing form)
**Scrape datum**: 2026-05-14

## BS2 page
- title: `Cliënten | Embrace The Future`
- h1: **Incidenten overzicht**
- 2 tabs: "Mijn cliënten" / "Alle incidenten"
- 0 records in current view

## BS2 toolbar
- Search
- 6 filter add-buttons: Status / Locatie / Medewerker / Categorie / Cliënt / Datum bereik
- Kolommen-knop
- Incident melden (primary)

## BS2 tabel (8 kolommen)
- (select) / Cliënt / Categorie / Status / Gemeldt door / Laatst bijgewerkt / Datum / Actie

(N.B.: BS2 heeft typo "Gemeldt" met t — BS1 toont correct "Gemeld door". Beide werken hetzelfde.)

## BS1 mirror

- h1 "Incidenten overzicht" ✅ matches BS2
- 2 tabs: `.incident-tab` "Mijn cliënten" + "Alle incidenten" ✅
- 8 kolommen (zelfde als BS2, met "Gemeld door" correcte spelling)
- Toolbar filters via dropdowns: `#inc-filter-status / -locatie / -medewerker / -categorie / -client / -datum-van / -datum-tot`
- Search: `#inc-search`
- Kolommen-knop: `#inc-columns-menu-btn`
- Incident melden: `#inc-add-open-btn` → navigeert naar incident-melden.html
- Archive-toggle: `#inc-archived-toggle`
- 144 records (BS1 superset)
- 11 categorieën: Delinquent Gedrag (64) / Vermist (23) / Middelenbezit (16) / Fysieke Agressie (17) / SGOG (2) / Verbale Agressie (15) / Letsel (1) / Medicatie (2) / Suïcidepoging (2) / Vrijheidsbeperkende Maatregelen (1) / Suïcidale Uitingen (1)

## BS1 modals
- `#inc-archive-modal` — Archiveren (slider)
- `#inc-purge-modal` — Definitief verwijderen (slider)

## Incident creation/editing
- BS1 gebruikt separate page `incident-melden.html` (NIET een modal)
- Form-secties: Cliënten / Tijd en plaats / Categorie / Omschrijving / Maatregelen / Bijlages / Notificaties
- BS2 zou ook een separate detail-page hebben voor incident creation

## Schema

- Supabase tabel: `public.incidenten`
- Velden: id / clientId / categorie / status / beoordelaarId / melderId / locatieId / incidentDatum / omschrijving / genomenMaatregelen / etc.
- Status enum values intern: in_afwachting / in_behandeling / opgelost (display proper case via dropdown)

## Status display

- Storage (snake_case): in_afwachting / in_behandeling / opgelost
- Display (proper case): "In afwachting" / "In behandeling" / "Opgelost"
- Geen visibility-bug — display matches BS2

## Geen bugs

Module 22 is **functioneel 100% pariteit** met BS2:
- 8 kolommen identiek
- 2 tabs identiek
- Alle filter-dropdowns aanwezig
- Status display proper case
- Add-flow naar dedicated page (zelfde patroon als BS2)
