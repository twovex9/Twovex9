-- _migrate_medewerker_locaties_clientscope.sql
-- Unit 6 (video-feedback eigenaar 2026-06-07): een Medewerker (en ZZP'er) moet de
-- cliënten kunnen ZIEN, maar ALLEEN die van de locatie(s) waaraan hij/zij gekoppeld is
-- ("alleen de cliënten waar je als locatie aan gekoppeld bent moet je kunnen zien").
--
-- Probleem: de clienten-SELECT-RLS liet de Medewerker (via is_begeleider, slug 'medewerker')
-- ALLE 86 cliënten lezen — alleen de nav was verborgen. Deze migratie scopet de pure
-- Medewerker op locatie, met VEILIGE DEFAULT: geen koppeling → 0 cliënten (geen leak).
-- Office/begeleider-rollen (Eigenaar/Directeur/HR/Planner/Cliëntbeheer[beschikkingen-test]/
-- Zorgcoördinator[teamleider]/Gedragswetenschapper) + admin-tier + Beleid blijven ONGEWIJZIGD.

-- 1. Koppeltabel medewerker ↔ locatie (HR/admin beheert; iedereen mag lezen voor de helper).
create table if not exists public.medewerker_locaties (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  locatie_id uuid not null references public.locaties(id) on delete cascade,
  aanmaakdatum timestamptz not null default now(),
  unique (medewerker_id, locatie_id)
);
create index if not exists idx_medewerker_locaties_med on public.medewerker_locaties(medewerker_id);
alter table public.medewerker_locaties enable row level security;

drop policy if exists "auth kan medewerker_locaties lezen" on public.medewerker_locaties;
create policy "auth kan medewerker_locaties lezen"
  on public.medewerker_locaties for select to authenticated using (true);

drop policy if exists "hr kan medewerker_locaties beheren" on public.medewerker_locaties;
create policy "hr kan medewerker_locaties beheren"
  on public.medewerker_locaties for all to authenticated
  using (is_admin(auth.uid()) or is_hr())
  with check (is_admin(auth.uid()) or is_hr());

-- 2a. Office-clientviewer = exact de is_begeleider-rollen MINUS 'medewerker'.
create or replace function public.is_office_clientviewer()
returns boolean language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid()
      and r.slug in ('admin','eigenaar','directeur','hr','planner','beschikkingen-test','teamleider','gedragswetenschapper')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- 2b. Locatie-NAMEN (matchen clienten.locatie text) van de huidige user's medewerker.
create or replace function public.current_user_medewerker_locatie_namen()
returns setof text language sql stable security definer set search_path to 'pg_catalog','public' as $$
  select l.naam
  from public.profiles p
  join public.medewerker_locaties ml on ml.medewerker_id = p.medewerker_id
  join public.locaties l on l.id = ml.locatie_id
  where p.id = auth.uid();
$$;

-- 3. Vervang de clienten-SELECT-policy door de locatie-gescopede variant.
drop policy if exists "clienten_select_begeleider_of_hr" on public.clienten;
create policy "clienten_select_begeleider_of_hr"
  on public.clienten for select to authenticated
  using (
    is_admin(auth.uid()) or is_hr() or (
      is_begeleider() and (
        is_office_clientviewer()
        or (locatie in (select public.current_user_medewerker_locatie_namen()))
      )
    )
  );

-- 4. Read-only voor de Medewerker: schrijf-policies van is_begeleider (incl. 'medewerker')
--    naar is_office_clientviewer (excl. 'medewerker'). De Medewerker mag cliënten WEL zien
--    (sectie 3, locatie-gescoped) maar NIET aanmaken/bewerken. Office-rollen ongewijzigd.
--    (DELETE was al admin/HR-only via clienten_delete_admin_of_hr — ongemoeid.)
drop policy if exists "clienten_insert_begeleider_of_hr" on public.clienten;
create policy "clienten_insert_begeleider_of_hr"
  on public.clienten for insert to authenticated
  with check (is_admin(auth.uid()) or is_hr() or is_office_clientviewer());

drop policy if exists "clienten_update_begeleider_of_hr" on public.clienten;
create policy "clienten_update_begeleider_of_hr"
  on public.clienten for update to authenticated
  using (is_admin(auth.uid()) or is_hr() or is_office_clientviewer())
  with check (is_admin(auth.uid()) or is_hr() or is_office_clientviewer());

-- 5. Medewerker mag cliënten ZIEN (topnav + pagina): browse/view-clients. Schrijven is via
--    sectie 4 geblokkeerd; zichtbaarheid is via sectie 3 locatie-gescoped (veilige default 0).
insert into public.bs2_role_permissions (role_id, permission_slug, is_hierarchical)
values ('15153cc8-46ae-4d01-ba03-7ff9418c22af','view-clients',false),
       ('15153cc8-46ae-4d01-ba03-7ff9418c22af','browse-clients',false)
on conflict do nothing;
