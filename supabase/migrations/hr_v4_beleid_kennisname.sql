-- ============================================================================
-- HR Module v4 — G26: Beleidskennisname (Onboarding Fase 3)
-- ============================================================================
-- Per medewerker × verplicht beleidsdocument: gelezen + ondertekend + datum + IP.
-- De 9 vaste documenten worden client-side als constante getoond; deze tabel legt
-- de kennisname vast. RLS: medewerker beheert EIGEN kennisname; HR/office leest alles.
-- Idempotent.
-- ============================================================================

create table if not exists public.beleid_kennisname (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  beleid_slug text not null,
  titel text,
  gelezen boolean default false,
  gelezen_op timestamptz,
  ondertekend boolean default false,
  ondertekend_op timestamptz,
  ip_adres text,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now(),
  constraint beleid_kennisname_uniek unique (medewerker_id, beleid_slug)
);
create index if not exists idx_beleid_kennisname_medewerker on public.beleid_kennisname(medewerker_id);

create or replace function public.set_beleid_kennisname_updated()
 returns trigger language plpgsql as $fn$ begin new.laatst_gewijzigd := now(); return new; end; $fn$;
drop trigger if exists trg_beleid_kennisname_updated on public.beleid_kennisname;
create trigger trg_beleid_kennisname_updated before update on public.beleid_kennisname
  for each row execute function public.set_beleid_kennisname_updated();

alter table public.beleid_kennisname enable row level security;
-- Lezen: eigen of office/HR.
drop policy if exists "beleid_kennisname select eigen of office" on public.beleid_kennisname;
create policy "beleid_kennisname select eigen of office" on public.beleid_kennisname
  for select to authenticated using (public.is_eigen_medewerker(medewerker_id::text) or public.is_office_staff());
-- Toevoegen/bewerken: eigen (medewerker tekent zelf) of office/HR.
drop policy if exists "beleid_kennisname insert eigen of office" on public.beleid_kennisname;
create policy "beleid_kennisname insert eigen of office" on public.beleid_kennisname
  for insert to authenticated with check (public.is_eigen_medewerker(medewerker_id::text) or public.is_office_staff());
drop policy if exists "beleid_kennisname update eigen of office" on public.beleid_kennisname;
create policy "beleid_kennisname update eigen of office" on public.beleid_kennisname
  for update to authenticated using (public.is_eigen_medewerker(medewerker_id::text) or public.is_office_staff())
  with check (public.is_eigen_medewerker(medewerker_id::text) or public.is_office_staff());
-- Verwijderen: alleen office/HR.
drop policy if exists "beleid_kennisname delete office" on public.beleid_kennisname;
create policy "beleid_kennisname delete office" on public.beleid_kennisname
  for delete to authenticated using (public.is_office_staff());

-- Aggregatie-RPC voor compliance-dashboard: % medewerkers dat alle 9 verplichte
-- beleidsdocumenten heeft ondertekend. p_aantal = aantal verplichte docs (default 9).
create or replace function public.hr_beleid_kennisname_pct(p_aantal integer default 9)
 returns numeric
 language sql stable security definer set search_path to 'public'
as $function$
  with actief as (
    select id from public.medewerkers where coalesce(archived,false)=false
  ),
  per_mw as (
    select a.id, count(*) filter (where bk.ondertekend) as getekend
    from actief a
    left join public.beleid_kennisname bk on bk.medewerker_id = a.id
    group by a.id
  )
  select case when (select count(*) from actief) = 0 then 0
    else round(100.0 * count(*) filter (where getekend >= p_aantal) / (select count(*) from actief), 1) end
  from per_mw;
$function$;

select 'hr_v4_beleid_kennisname OK' as result;
