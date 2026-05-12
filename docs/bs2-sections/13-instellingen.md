# BS2 — Instellingen (`/settings/...`)

**Default URL**: https://etf.acceptance.besasuite.nl/settings → redirect `/settings/users`

## Sub-pagina's

| Tab | URL | Doel |
|---|---|---|
| **Gebruikers** (default) | `/settings/users` | Gebruikersbeheer (auth users, niet medewerkers) |
| Entiteiten | `/settings/entities` | Onbekend — mogelijk Master-data lijsten beheer |
| Notificaties | `/settings/notification-types` | Notification-type configuratie |

## /settings/users — Gebruikers

### Toolbar
- **Kolommen**
- **Gebruiker toevoegen** (action)
- search "Zoeken..."
- **Gearchiveerd** toggle
- 1 combobox (filter, niet zichtbaar)

### Tabel
- 0 of 0 total
- Standaard paginering

## Inferred datamodel — `users` + `notification_types`

```sql
-- "Gebruikers" zijn auth-users + profielen — al in BS1 via auth.users + public.profiles
-- Wat extra in BS2 zou kunnen:

create table if not exists public.notification_types (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique,
  beschrijving text,
  default_aan boolean default true,
  archived boolean default false
);

-- "Entiteiten" — onduidelijk; mogelijk:
-- - master-data registratie (zorgsoorten/bureaus/locaties als entiteiten)
-- - of admin van organisatie-units (entiteiten = sub-organisaties)
```

## Parity met BS1

- ✅ Gebruikers + rollen via `public.profiles` + Supabase Auth — al aanwezig
- ❌ `notification_types` tabel niet in BS1
- ❌ "Entiteiten" concept niet (nog) in BS1
- 🟡 Algemene Instellingen-pagina (`werkruimte.html` settings-tab?) — partial in BS1

## Volgende stappen (Phase 2)

- `/settings/entities` deeper bezoek om concept te begrijpen
- `/settings/notification-types` velden vastleggen
- Vergelijk met BS1 `werkruimte.html` settings-tab
