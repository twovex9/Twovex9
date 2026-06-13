# Module 17 — Cliënten Organisaties — STRUCTURE

**BS2 URL**: `/clients/organizations`
**BS1 URL**: `https://futureflow-app.vercel.app/organisatie.html`
**Scrape datum**: 2026-05-14

## BS2 page

- title: `Organisatie | Embrace The Future`
- h1: **Organisatie** (singular)
- 4 records: Planet Young / IHub / Youz / Gripzorg

## Toolbar

- Search-input (Zoeken...)
- Gearchiveerd-toggle
- Kolommen-knop
- `Organisatie toevoegen` (primary)

## Tabel (1 hoofdkolom)

| Kolom | Inhoud |
|---|---|
| (select) | Multi-select checkbox |
| Naam | Organisatie-naam |

## BS1 modals

- `#org-add-modal` — Organisatie toevoegen (modal-overlay)
- `#org-archive-modal` — Archiveren (modal-overlay--confirm + slider)
- `#org-purge-modal` — Definitief verwijderen (modal-overlay--confirm + slider)

## Schema

- Supabase tabel: `public.organisaties`
- PK: id (text)
- Velden: id / naam / archived / aanmaakdatum / laatst_gewijzigd

## Data state na Bug #48 fix

- BS1: 93 records (was 90, +3 toegevoegd)
- BS2: 4 records (Planet Young / IHub / Youz / Gripzorg) — alle 4 nu ook in BS1 ✅

## Bug gefixt

- **#48** (data): 3 BS2 organisaties (IHub / Youz / Gripzorg) ontbraken in BS1 — toegevoegd via SQL INSERT
- BS1 blijft superset (93 records voor invoice/external-org context); 4 BS2 care providers nu ook aanwezig

## Definition difference (BS1 vs BS2 scope)

- **BS2** "Organisatie" in Cliënten-menu = **care providers** (waar cliënten worden geplaatst): 4 records
- **BS1** `organisaties` tabel = **alle organisaties** (care providers + ZZP + invoice senders): 93 records
- 4 BS2 care providers zijn een subset van BS1's 93
- Pariteit-eis vervuld: alle BS2-records bestaan in BS1
