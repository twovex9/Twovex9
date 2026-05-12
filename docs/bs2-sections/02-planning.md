# BS2 — Planning (`/planning` → `/planning/overview`)

**URL**: https://etf.acceptance.besasuite.nl/planning (redirect naar `/planning/overview`)
**Page title**: Planning Overview | Embrace The Future

## Structuur

Multi-page module — `/planning` redirect naar `/planning/overview`. Verwacht ook andere sub-routes (zoals `/planning/diensten`, `/planning/aanvragen`, etc.) — moet ik nog verkennen.

## Filter-paneel (linker zijbalk)

**Header**: "Filter Voorinstellingen" + "Aangepaste Filters"

- **Diensttype** — dropdown "Selecteer"
- **Toewijzingsstatus** — opties:
  - Toegewezen
  - Niet toegewezen
  - Vervanging vereist
  - Alle
- **Dienstverband** — opties:
  - Inhuur (ZZP)
  - Loondienst
  - Inhuur en Loondienst
- **Teamlid** — dropdown "Selecteer een teamlid"
- **Cliënt** — dropdown "Selecteer Cliënt"
- Action: "Exporteren"
- Action: "Filters wissen"

## Locatie + datum controls (boven)

- "Selecteer Locatie" — locatie-filter
- "Vandaag" — datum-shortcut
- "Week 20 May 2026" — huidige week-indicator (weeknummer + start-datum)
- View toggles:
  - Raster / Lijst (grid vs list view)
  - Week / Maand (granularity)
- Action buttons (rechtsboven):
  - **Genereren** — vermoedelijk auto-genereer rooster
  - **Optimiseren** — vermoedelijk shift-optimizer
  - **Dienst aanmaken** — handmatig nieuwe shift

## KPI-cards (boven het rooster)

| KPI | Waarde (huidige week) |
|---|---|
| ZZP Kosten | € 0,00 |
| Geplande uren | 0u |
| Openstaande uren | 0u |
| Kilometerkosten | € 0,00 |
| Gem. tarief | € 0,00 |

## Rooster-grid (hoofdcontent)

- Header rij: `ma. 11`, `di. 12`, ..., `zo. 17` (7 dagen)
- Per dag (column):
  - "Openstaande diensten" count
  - "ZZP" kosten (€)
  - "Openstaande uren"
  - "KM" kosten (€)
  - "Gem." tarief (€/u)
  - "Geen beschikbare medewerkers" (placeholder als leeg)

## Inferred datamodel — planning + diensten

```sql
create table if not exists public.diensten (
  id uuid primary key default gen_random_uuid(),
  diensttype_id uuid references public.comp_diensttypes(id),
  locatie_id uuid references public.locaties(id),
  client_id text references public.clienten(id),
  toegewezen_medewerker_id uuid references public.medewerkers(id),
  toewijzingsstatus text check (toewijzingsstatus in ('toegewezen','niet_toegewezen','vervanging_vereist')),
  dienstverband text check (dienstverband in ('inhuur','loondienst')),
  start_tijd timestamptz not null,
  eind_tijd timestamptz not null,
  geplande_uren numeric,
  zzp_uurtarief numeric,
  zzp_totaalkosten numeric,
  kilometerkosten numeric,
  archived boolean default false,
  created_at timestamptz default now()
);
```

**Vergelijking met bestaande BS1 schema** (uit `list_tables`):
- BS1 heeft `public.planning` (13 rijen) — bestaat al
- BS1 heeft `public.comp_diensttypes` (0 rijen) — bestaat
- BS1 heeft `public.medewerkers`, `public.locaties`, `public.clienten` als FK-targets
- BS1 heeft `public.urendeclaraties` (7 rijen) — hangt waarschijnlijk samen
- BS1 heeft `public.werkuren` (0 rijen) + `public.werkuren_vergrendeld` + `public.werkuren_labels` (6 rijen)
- ❓ Veld-mapping tussen BS1 `planning` en BS2 `diensten` moet geverifieerd (verbose `list_tables` later)

## Status / parity met BS1

- 🟡 BS1 heeft `planning.html` bestand maar zonder de filter-rijkdom (Diensttype, Toewijzingsstatus, Dienstverband filters)
- ❌ "Genereren" / "Optimiseren" knoppen — onbekend of BS1 dit heeft (waarschijnlijk niet)
- 🟡 KPI-cards met kosten — onbekend in BS1
- ❌ Multi-view (Raster/Lijst, Week/Maand) — moet geverifieerd in BS1

## Volgende stappen (Phase 2 voor deze sectie)

- Verkennen sub-routes: `/planning/aanvragen` (verlof?), `/planning/diensten/<id>` (detail), etc.
- DevTools network log bekijken bij filters wisselen om API-endpoints + payload-vorm te zien
- "Dienst aanmaken" modal openen om alle invoer-velden te zien
- "Genereren" + "Optimiseren" begrijpen — auto-scheduling logica? Externe service?
