# BS2 — Organisatie (`/organization/...`)

**Default URL**: https://etf.acceptance.besasuite.nl/organization/teams

## Sub-pagina's

| Tab | URL | Doel |
|---|---|---|
| Rollen | `/organization/roles` | Rol-definities (admin / medewerker / viewer / teamleider?) |
| Teams | `/organization/teams` (current) | Team-management |

## /organization/teams

### Header / KPI
- Page-titel: "Organisatie"
- Subtitle: "Beheer teams, toewijzingen en organisatiestructuur"

| KPI | Waarde |
|---|---|
| Totaal teams | 0 |
| Totaal medewerkers | 0 |
| Teamleiders | 0 |
| Locaties | 0 |

### Toolbar
- **Kolommen**, **Add Team**, search "Zoeken...", **Gearchiveerd** toggle
- Filter: "Team" (zelf-referentie?)

### Tabel
- 0 of 0 total — leeg in deze test-env
- Paginering ondersteund

## Inferred datamodel — `teams` + `rollen`

```sql
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  team_leider_id uuid references public.medewerkers(id),
  locatie_id uuid references public.locaties(id),
  archived boolean default false,
  created_at timestamptz default now()
);

-- M2M medewerker ↔ team
create table if not exists public.medewerker_teams (
  medewerker_id uuid references public.medewerkers(id),
  team_id uuid references public.teams(id),
  primary key (medewerker_id, team_id)
);

-- Rollen — al deels in BS1 via profiles.rol
-- BS2 mogelijk fijnmaziger: aparte rollen-tabel?
```

## Parity met BS1

- ❌ Geen `teams` tabel in BS1
- ✅ Rollen: BS1 `public.profiles.rol` (enum: admin/medewerker/viewer) — al aanwezig
- 🟡 BS1 `werkruimte.html` heeft "org"-tab — implementatie onbekend
- **Gap**: teams-module is nieuw voor BS1 (tabel + M2M + UI + data-laag)
