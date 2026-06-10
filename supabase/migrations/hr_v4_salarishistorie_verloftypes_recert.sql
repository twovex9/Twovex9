-- ============================================================================
-- HR Module v4 — G21 (salarishistorie) + G25 (verloftypes-beheer) + G42 (recert-RPC's)
-- ============================================================================
-- Idempotent. Toepassen: node scripts/apply-migrations.mjs hr_v4_salarishistorie_verloftypes_recert.sql

-- ----------------------------------------------------------------------------
-- G21 — medewerker_salaris_historie: automatische historie van salariswijzigingen.
-- Trigger op medewerkers (data->> salaris/schaal/trede/contracturen wijzigt) →
-- nieuwe historie-rij. Self-service leest eigen rijen ("Mijn salarisontwikkeling").
-- medewerkers.id = uuid → medewerker_id hier text voor consistentie met de
-- overige HR-subtabellen (geen harde FK; zelfde patroon als verzuim.medewerker_id).
-- ----------------------------------------------------------------------------
create table if not exists public.medewerker_salaris_historie (
  id uuid primary key default gen_random_uuid(),
  medewerker_id text not null,
  ingangsdatum date not null default (now() at time zone 'Europe/Amsterdam')::date,
  schaal text,
  trede text,
  contracturen text,
  bruto_maand text,
  bron text default 'dossier',
  aanmaakdatum timestamptz default now()
);
create index if not exists idx_msh_medewerker on public.medewerker_salaris_historie(medewerker_id);

alter table public.medewerker_salaris_historie enable row level security;
drop policy if exists "msh_select_office_of_eigen" on public.medewerker_salaris_historie;
create policy "msh_select_office_of_eigen" on public.medewerker_salaris_historie
  for select to authenticated
  using (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id));
-- Schrijven loopt uitsluitend via de SECURITY DEFINER-trigger; geen insert-policy
-- voor authenticated nodig (HR muteert het dossier, de trigger logt).

create or replace function public.msh_log_salaris_wijziging()
 returns trigger language plpgsql security definer
 set search_path to 'public'
as $function$
declare
  o_sal text; n_sal text; o_sch text; n_sch text; o_tr text; n_tr text; o_cu text; n_cu text;
begin
  o_sal := old.data->>'salaris';      n_sal := new.data->>'salaris';
  o_sch := old.data->>'salarisschaal'; n_sch := new.data->>'salarisschaal';
  o_tr  := old.data->>'salaristrede';  n_tr  := new.data->>'salaristrede';
  o_cu  := old.data->>'contracturen';  n_cu  := new.data->>'contracturen';
  if (n_sal is distinct from o_sal) or (n_sch is distinct from o_sch)
     or (n_tr is distinct from o_tr) or (n_cu is distinct from o_cu) then
    insert into public.medewerker_salaris_historie
      (medewerker_id, schaal, trede, contracturen, bruto_maand, bron)
    values (new.id::text, n_sch, n_tr, n_cu, n_sal, 'dossier');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_msh_salaris_historie on public.medewerkers;
create trigger trg_msh_salaris_historie
  after update of data on public.medewerkers
  for each row execute function public.msh_log_salaris_wijziging();

-- Backfill: huidige stand als eerste historie-rij voor dossiers met salarisdata
-- (eenmalig; idempotent door not-exists-check).
insert into public.medewerker_salaris_historie (medewerker_id, schaal, trede, contracturen, bruto_maand, bron)
select m.id::text, m.data->>'salarisschaal', m.data->>'salaristrede', m.data->>'contracturen', m.data->>'salaris', 'backfill'
from public.medewerkers m
where coalesce(m.archived, false) = false
  and (coalesce(m.data->>'salaris','') ~ '[1-9]' or coalesce(m.data->>'salarisschaal','') ~ '[0-9]')
  and not exists (select 1 from public.medewerker_salaris_historie h where h.medewerker_id = m.id::text);

-- ----------------------------------------------------------------------------
-- G25 — verloftypes: beheerbare verloftypes (v2 van de hardcoded lijst in
-- verlof-data.js). De 2-staps-goedkeuringsroute (teamleider → HR) blijft de
-- werkflow; dit beheert welke typen bestaan/actief zijn + hun NL-label.
-- ----------------------------------------------------------------------------
create table if not exists public.verloftypes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  actief boolean not null default true,
  volgorde integer not null default 0,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);

alter table public.verloftypes enable row level security;
drop policy if exists "vt_select_auth" on public.verloftypes;
create policy "vt_select_auth" on public.verloftypes
  for select to authenticated using (true);
drop policy if exists "vt_insert_office" on public.verloftypes;
create policy "vt_insert_office" on public.verloftypes
  for insert to authenticated with check (public.is_hr());
drop policy if exists "vt_update_office" on public.verloftypes;
create policy "vt_update_office" on public.verloftypes
  for update to authenticated using (public.is_hr()) with check (public.is_hr());
drop policy if exists "vt_delete_office" on public.verloftypes;
create policy "vt_delete_office" on public.verloftypes
  for delete to authenticated using (public.is_hr());

insert into public.verloftypes (code, label, volgorde) values
  ('wettelijk', 'Wettelijk', 1),
  ('bovenwettelijk', 'Bovenwettelijk', 2),
  ('ouderschap', 'Ouderschap', 3),
  ('calamiteit', 'Calamiteit', 4),
  ('doktersbezoek', 'Doktersbezoek', 5),
  ('onbetaald', 'Onbetaald', 6),
  ('anders', 'Anders', 7)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- G42 — recertificering-overzicht + agressietraining-dekking (office-gated).
-- ----------------------------------------------------------------------------
drop function if exists public.hr_recertificering_overzicht();
create or replace function public.hr_recertificering_overzicht()
 returns table(
   medewerker_id text,
   medewerker_naam text,
   doc_naam text,
   doc_type text,
   vervaldatum date,
   dagen_tot_verval integer
 )
 language sql stable security definer
 set search_path to 'public'
as $function$
  select
    m.id::text,
    coalesce(
      nullif(trim(coalesce(m.data->>'voornaam','') || ' ' || coalesce(m.data->>'achternaam','')), ''),
      m.data->>'naam', m.email, m.id::text
    ),
    d.naam,
    d.type,
    d.vervaldatum_date,
    (d.vervaldatum_date - (now() at time zone 'Europe/Amsterdam')::date)::int
  from public.medewerker_documenten d
  join public.medewerkers m on m.id::text = d.medewerker_id
  where public.is_office_staff()
    and coalesce(d.archived, false) = false
    and coalesce(m.archived, false) = false
    and d.vervaldatum_date is not null
    and d.type in ('education', 'vog')
    and d.vervaldatum_date <= (now() at time zone 'Europe/Amsterdam')::date + 90
  order by d.vervaldatum_date asc;
$function$;

create or replace function public.hr_agressie_training_aantal()
 returns integer
 language sql stable security definer
 set search_path to 'public'
as $function$
  select case when public.is_office_staff() then (
    select count(distinct d.medewerker_id)::int
    from public.medewerker_documenten d
    join public.medewerkers m on m.id::text = d.medewerker_id
    where coalesce(d.archived,false) = false
      and coalesce(m.archived,false) = false
      and coalesce(d.naam,'') ~* 'agressie'
      and (d.vervaldatum_date is null or d.vervaldatum_date >= (now() at time zone 'Europe/Amsterdam')::date)
  ) else 0 end;
$function$;

select 'hr_v4_salarishistorie_verloftypes_recert OK' as result;
