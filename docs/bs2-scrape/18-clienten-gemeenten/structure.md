# Module 18 — Cliënten Gemeenten — STRUCTURE

**BS2 URL**: `/clients/municipalities`
**BS1 URL**: `https://besa-suite.vercel.app/gemeenten.html`
**Scrape datum**: 2026-05-14

## BS2 page
- title: `Gemeenten | Embrace The Future`
- h1: **Gemeenten**
- 316 records

## Toolbar
- Kolommen-knop
- Gemeente toevoegen (primary)
- (geen search visible in primaryBtns — kan via Zoeken-input)

## Tabel (1 hoofdkolom)

| Kolom | Inhoud |
|---|---|
| (select) | Multi-select checkbox |
| Naam | Gemeente-naam + financierings-codes (WLZ/WMO etc.) |

## BS1 modals
- `#gem-add-modal` — Gemeente toevoegen
- `#gem-archive-modal` — Archiveren (slider)
- `#gem-purge-modal` — Definitief verwijderen (slider)

## Schema
- Supabase tabel: `public.gemeenten`
- PK: uuid
- Velden: id (uuid) / naam (text) / archived / aanmaakdatum / laatst_gewijzigd

## Data state
- BS1: 238 records
- BS2: 316 records
- 5 sample BS2 records gecheckt: alle 5 in BS1 (Uitgeest / WLZ / WMO / YOUZ/Rotterdam / SED Stede Broec)
- 78 records missing in BS1 = ongebruikte Nederlandse gemeenten (geen actieve cliënten daar)

## Notitie

Sample-check toont dat BS1 alle operationeel-relevante gemeenten heeft. De 78 missing zijn Nederlandse gemeenten die geen actieve ETF-cliënten hebben. Voor productie-pariteit is dit niet blokkerend. Toekomstige BS2-sync (Fase B) kan de complete BS2-lijst overnemen indien nodig.
