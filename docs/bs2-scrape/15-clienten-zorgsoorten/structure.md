# Module 15 — Cliënten Zorgsoorten — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/clients/care-types`
**BS1 URL**: `https://besa-suite.vercel.app/zorgsoorten.html`
**Scrape datum**: 2026-05-14

## BS2 page

- title: `Zorgsoorten | Embrace The Future`
- h1: **Zorgsoorten**
- Cliënten-sidebar positie 2 (na Cliënten)

## Toolbar

- Search-input (placeholder "Zoeken...")
- Gearchiveerd-toggle
- `Kolommen` knop (kolom-zichtbaarheid panel)
- `+ Zorgsoort toevoegen` (primary)

## Tabel (eenvoudig, 2 hoofdkolommen)

| Kolom | Inhoud |
|---|---|
| (select) | Multi-select checkbox |
| Naam | bv. "Gecombineerd", "WLZ", "Ambulant extern" |
| Tarieftype | Week / Uur / Dag |

## Records (6 totaal in BS2 + BS1)

1. Ambulant extern — Uur
2. Ambulant intern — Uur
3. Fasewonen — Dag
4. Gecombineerd — Week
5. Verblijf en behandeling — Dag
6. WLZ — Uur

## BS1 modals

- `#zs-add-modal` — Zorgsoort toevoegen (`modal-overlay`)
- `#zs-archive-modal` — Archiveren (`modal-overlay--confirm` + slider)
- `#zs-purge-modal` — Definitief verwijderen (`modal-overlay--confirm` + slider)

## Schema

- Supabase tabel: `public.zorgsoorten`
- PK: `id` (uuid)
- Kolommen: id (uuid) / naam (text) / tarieftype (text, enum 'uur'/'dag'/'week') / archived (bool) / aanmaakdatum / laatst_gewijzigd
- RLS: auth-only

## Bugs gefixt

- **#41** (data): "test" record verwijderd via SQL DELETE (7 → 6 records)
- **#42** (data): "Wlz" → "WLZ" via SQL UPDATE (matches BS2 spelling)

## Display vs storage

- BS1 stores tarieftype lowercase (`uur`/`dag`/`week`) — design-choice voor data consistency
- BS1 rendert table met proper case (`Uur`/`Dag`/`Week`) via JS — matches BS2 display
- Geen storage/display mismatch
