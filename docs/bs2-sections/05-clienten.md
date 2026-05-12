# BS2 — Cliënten (`/clients/...`)

**Default URL**: https://etf.acceptance.besasuite.nl/clients/manage-incidents
**Page title**: Cliënten | Embrace The Future

## Cliënten is een module met 9 SUB-PAGINA'S

URL-naamgevingsconventie: **`/clients/<english-slug>`** (Dutch label in UI, English in URL)

| # | Tab | URL | BS1 mapping |
|---|---|---|---|
| 1 | Cliënten (overview) | `/clients/overview` | ✅ `clienten.html` |
| 2 | Zorgsoorten | `/clients/care-types` | ✅ tabel `public.zorgsoorten` (7 rows) |
| 3 | Beschikkingen | _(URL nog niet zichtbaar — option ref_27 zonder href)_ | ✅ `beschikkingen.html`, `beschikkingen-overzicht.js` |
| 4 | Organisatie | `/clients/organizations` | ✅ `public.organisaties` (4 rows) |
| 5 | Gemeenten | `/clients/municipalities` | ✅ `gemeenten.html`, `public.gemeenten` (227 rows) |
| 6 | Urendeclaraties | `/clients/hour-declarations` | ✅ `public.urendeclaraties` (7 rows) |
| 7 | Uren budgetering | `/clients/weekly-budget` | 🟡 `public.uren_budget` (0 rows) — schema bestaat |
| 8 | Facturen importeren | `/clients/import-csv` | ✅ `facturen-importeren.html` |
| 9 | Incidenten | `/clients/manage-incidents` (current) | ✅ `incidenten.html`, `incident-melden.html`, `public.incidenten` |

→ Phase 1.10: alle 9 sub-pagina's afzonderlijk bezoeken voor velden + API endpoints.

## /clients/manage-incidents — Incidenten overzicht

### Header
- "Cliënten" (module-titel)
- "Incidenten overzicht"
- Subtitle: "Beheer en reageer op alle gemelde incidenten"

### KPI-cards
| KPI | Waarde |
|---|---|
| Totaal incidenten | 0 |
| In afwachting | 0 |
| In behandeling | 0 |
| Opgelost | 0 |

### Tabs
- **Mijn cliënten** (filter naar incidents bij eigen cliënten)
- **Alle incidenten** (admin-view)

### Toolbar
- **Kolommen** (kolomkiezer)
- **Incident melden** (primary action)
- Search: `Zoeken...`
- Filter dropdowns:
  - Status
  - Locatie
  - Medewerker
  - Categorie
  - Cliënt
  - **Datum bereik**

### Tabel-kolommen
| Kolom | Type/format |
|---|---|
| Cliënt | naam |
| Categorie | enum (uit `incident_categorieen` waarschijnlijk) |
| Status | enum (in_afwachting / in_behandeling / opgelost) |
| Gemeldt door | profiles.naam (sic: "Gemeldt" — typo of dialect?) |
| Laatst bijgewerkt | timestamp |
| Datum | timestamp (gebeurtenis) |
| Actie | actie-knoppen |

## API endpoints ontdekt

```
GET /api/incidents?filter[my_clients]=true&page=1&limit=15
```

- Filter-pattern: `filter[<key>]=<value>`
- Boolean filters mappen op `true`/`false` strings

## Inferred datamodel — `incidenten`

```sql
create table if not exists public.incidenten (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.clienten(id),
  categorie_id uuid references public.incident_categorieen(id),
  status text check (status in ('in_afwachting','in_behandeling','opgelost')) not null default 'in_afwachting',
  gemeld_door_id uuid references public.profiles(id),
  locatie_id uuid references public.locaties(id),
  medewerker_id uuid references public.medewerkers(id),
  datum_gebeurtenis timestamptz not null,
  laatst_bijgewerkt timestamptz default now(),
  beschrijving text,
  archived boolean default false
);
```

**BS1 schema-vergelijk** (uit `list_tables`):
- ✅ `public.incidenten` (0 rows, RLS aan) — bestaat
- ✅ `public.incident_categorieen` (13 rows) — categorieën al gevuld
- ✅ `public.incident_documenten` (0 rows) — voor bestand-uploads bij incident
- ✅ `public.verbeteringsmaatregelen` (0 rows) — follow-up maatregelen

## Status / parity met BS1

- ✅ Cliënten-module bestaat sterk in BS1 met de meeste tabellen al aanwezig
- 🟡 Sub-page structuur: BS2 unified, BS1 verspreid (`clienten.html`, `gemeenten.html`, `beschikkingen.html` etc.)
- ✅ Incidents-data-model overlapt grotendeels
- 🟡 Tab "Mijn cliënten" vs "Alle incidenten" — filter-logica per rol; BS1 heeft profiles + rollen (Stage 8b) maar onbekend of deze filter toegepast wordt
- ❓ KPI dashboards (Totaal / In afwachting / In behandeling / Opgelost) — BS1 heeft `incidenten-dashboard.js`; vergelijken later
