# BS2 — Taken (`/tasks` → `/tasks/list`)

**URL**: https://etf.acceptance.besasuite.nl/tasks → redirect `/tasks/list`

## Structuur
- Tabs: **Mijn taken** / **Alle taken**
- View modes: Lijst (current), Schakel kalender, Schakel medewerker
- Action: **Taak toevoegen**
- Toggle: **Voltooide taken verbergen**, Gearchiveerd
- Filters: Status, Prioriteit, Toegewezen aan (teamlid), Deadline, Aanmaakdatum
- Sort: Sorteren op (deadline / status / prioriteit)
- Search: "Search tasks..."

## Tabel-kolommen
| Kolom | Type |
|---|---|
| Taaknaam | text |
| Toegewezen aan | medewerker |
| Aangemaakt door | profile |
| Status | enum (open / in_progress / voltooid?) |
| Deadline | date |
| Prioriteit | enum (laag / midden / hoog?) |

## Inferred datamodel — `taken`

```sql
create table if not exists public.taken (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  beschrijving text,
  toegewezen_aan_id uuid references public.medewerkers(id),
  aangemaakt_door_id uuid references public.profiles(id),
  status text check (status in ('open','in_progress','voltooid','geannuleerd')) default 'open',
  prioriteit text check (prioriteit in ('laag','midden','hoog')) default 'midden',
  deadline date,
  voltooid_op timestamptz,
  archived boolean default false,
  created_at timestamptz default now()
);
```

## Parity met BS1

- ❌ Geen `taken`-tabel in BS1 (`list_tables` toont geen `taken` of `tasks`)
- 🟡 BS1 `werkruimte.html` heeft een "taken"-tab volgens earlier exploration (`werkruimte.js` tabbed: "taken, verlof, beleid, audit, org, settings")
- ❌ Vermoedelijk in BS1 wel een werkruimte-tab maar geen volledige module
- **Belangrijke gap**: dit is een aparte module bouwen voor BS1
