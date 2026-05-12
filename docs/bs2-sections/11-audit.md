# BS2 — Audit (`/audit`)

**URL**: https://etf.acceptance.besasuite.nl/audit
**Page-titel**: Audit Logs

## Structuur
- Header: "Audit Logs"
- Toolbar: **Kolommen**, search "Zoeken..."
- Filters:
  - **Resources** (welke entiteit: medewerker, factuur, dienst, etc.)
  - **Veroorzaker** (wie de actie deed — profiles)
  - **Actie type** (create/update/delete/archive/restore?)
- 0 entries op moment van capture (mogelijk filter-default of leeg in deze test-env)

## Inferred datamodel — `audit_log` (algemeen)

```sql
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,           -- 'medewerker','factuur','dienst','beschikking',...
  resource_id text not null,             -- ID van betreffende rij (text om beide PK-types te ondersteunen)
  actie_type text check (actie_type in ('create','update','delete','archive','restore')),
  veroorzaker_id uuid references public.profiles(id),
  payload jsonb,                          -- voor/na waardes
  created_at timestamptz default now()
);

create index audit_log_resource_idx on public.audit_log (resource_type, resource_id);
create index audit_log_veroorzaker_idx on public.audit_log (veroorzaker_id, created_at desc);
```

## Parity met BS1

- 🟡 BS1 heeft `public.beschikking_audit_log` (1 row) — domein-specifiek
- ❌ Geen algemene `audit_log` tabel in BS1
- ❌ Geen unified audit-page in BS1 (`werkruimte.html` heeft "audit"-tab, maar reikwijdte onbekend)
- **Gap**: cross-cutting audit-systeem zou nieuw moeten worden gebouwd in BS1 — of we accepteren dat BS1 alleen specifieke audit-logs heeft per domein
