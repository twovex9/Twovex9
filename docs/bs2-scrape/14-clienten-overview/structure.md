# Module 14 — Cliënten overview — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/clients/overview`
**BS1 URL**: `https://besa-suite.vercel.app/clienten.html`
**Scrape datum**: 2026-05-14

## BS2 page

- title: `Cliënten | Embrace The Future`
- h1: **Cliënten**
- Cliënten-sidebar bevat 9 items: Cliënten / Zorgsoorten / Beschikkingen (group) / Organisatie / Gemeenten / Urendeclaraties / Uren budgetering / Facturen importeren / Incidenten

## Toolbar / acties

- Search-input (placeholder "Zoeken...")
- Filter add-buttons: In zorg datum / Voornaam / Achternaam / Cliëntnummer / Locatie / Fase / Gemeente / Organisatie / Required forms / Uit zorg datum
- `Kolommen` (kolom-toggle panel)
- `Exporteren` (CSV/Excel export)
- `Cliënt toevoegen` (primary)
- Multi-select checkbox header

## Tabel (10 kolommen)

| Kolom | BS1 | BS2 |
|---|---|---|
| (select) | ✅ checkbox | ✅ |
| Voornaam | ✅ | ✅ |
| Achternaam | ✅ | ✅ |
| Cliëntnummer | ✅ | ✅ |
| Locatie | ✅ | ✅ |
| Fase | ✅ pill | ✅ pill |
| Gemeente | ✅ | ✅ |
| Organisatie | ✅ | ✅ |
| Required forms | ✅ | ✅ |
| Uit zorg datum | ✅ | ✅ |
| Acties | ✅ trash icon | ✅ |

## BS1 modals

- `#cl-add-modal` — Cliënt toevoegen (`modal-overlay`)
- `#cl-archive-modal` — Archiveren bevestigen (`modal-overlay--confirm` + slider)
- `#cl-purge-modal` — Definitief verwijderen (`modal-overlay--confirm` + slider, alleen archived)

## Schema

- Supabase tabel: `public.clienten`
- PK: `id` (text)
- Kolommen: voornaam / achternaam / clientnummer (int) / locatie / fase / gemeente / organisatie / archived / aanmaakdatum / laatst_gewijzigd / data (jsonb met BS2-velden)

## Data state na Bug-fixes

- 160 records totaal (was 161, Test Client gecleaned)
- Phase pariteit (na case-normalisatie):
  - In zorg: 116
  - Uit zorg: 36
  - In aanvraag: 8
- BS2 toont 87 in current overview view (legacy data-mismatch — fase B/D scope, niet module 14)
- 12 records zonder bs2_id = legitieme BS1-only records
- 0 ZZZ-CLAUDE-TEST records

## Bugs gevonden

- **#38** (data): Phase case-inconsistentie 6 → 3 unique values via SQL UPDATE
- **#39** (data): Test Client record verwijderd via SQL DELETE
- **#40** (UI): Add/Archive/Purge modals — Escape + Overlay close-ways toegevoegd
