-- ============================================================================
-- HR Module v4 — Fase 0: SQL-fundament + reproduceerbaarheid
-- ============================================================================
-- Idempotent. Toepasbaar via: node scripts/db-exec.mjs "$(cat supabase/migrations/hr_v4_fase0_fundament.sql)"
-- Bevat: G9 (vervaldatum_date), G43 (verzuim-RLS hardening + mirror),
--        G47 (verzuim.medewerker_id), G45-deel (RLS-helpers mirror).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- G45 (deel) — Kern-RLS-helpers gespiegeld vanuit productie naar version control.
-- Deze bestonden al live; hier idempotent zodat nieuwe HR-RLS auditeerbaar/herbouwbaar is.
-- Rolbron = bs2_role_users (email-match) -> bs2_roles.slug. NIET org_roles.
-- ----------------------------------------------------------------------------

create or replace function public.is_hr()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in ('admin','eigenaar','directeur','hr','salarisadministratie')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$function$;

create or replace function public.is_office_staff()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug not in ('medewerker','medewerker-test','detacheringsbureau')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$function$;

create or replace function public.is_eigen_medewerker(m_id text)
 returns boolean language sql stable security definer
 set search_path to 'public'
as $function$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.medewerker_id::text = m_id
  );
$function$;

create or replace function public.can_view_management()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in ('eigenaar','directeur')
  );
$function$;

-- ----------------------------------------------------------------------------
-- G9 — medewerker_documenten: betrouwbare date-kolom voor verloopbewaking.
-- vervaldatum (text) is mixed-format (YYYY-MM-DD + DD-MM-YYYY + ''); to_date is
-- niet immutable (geen generated column), dus: trigger-onderhouden date-kolom.
-- ----------------------------------------------------------------------------

alter table public.medewerker_documenten
  add column if not exists vervaldatum_date date;

create or replace function public.mw_doc_parse_vervaldatum(p_txt text)
 returns date language plpgsql immutable as $function$
begin
  if p_txt is null then return null; end if;
  if p_txt ~ '^\d{4}-\d{2}-\d{2}$' then return to_date(p_txt, 'YYYY-MM-DD'); end if;
  if p_txt ~ '^\d{2}-\d{2}-\d{4}$' then return to_date(p_txt, 'DD-MM-YYYY'); end if;
  return null;
exception when others then return null;
end;
$function$;

create or replace function public.mw_doc_sync_vervaldatum_date()
 returns trigger language plpgsql as $function$
begin
  new.vervaldatum_date := public.mw_doc_parse_vervaldatum(new.vervaldatum);
  return new;
end;
$function$;

drop trigger if exists trg_mw_doc_vervaldatum_date on public.medewerker_documenten;
create trigger trg_mw_doc_vervaldatum_date
  before insert or update of vervaldatum on public.medewerker_documenten
  for each row execute function public.mw_doc_sync_vervaldatum_date();

-- Backfill bestaande rijen
update public.medewerker_documenten
  set vervaldatum_date = public.mw_doc_parse_vervaldatum(vervaldatum)
  where vervaldatum_date is distinct from public.mw_doc_parse_vervaldatum(vervaldatum);

create index if not exists idx_mw_doc_vervaldatum_date
  on public.medewerker_documenten (vervaldatum_date)
  where coalesce(archived, false) = false;

-- ----------------------------------------------------------------------------
-- G43 — verzuim_mijlpalen + verzuim_contactmomenten: mirror DDL + office-only RLS.
-- Stonden live volledig open (using(true)); poortwachter-data hoort office-only.
-- ----------------------------------------------------------------------------

create table if not exists public.verzuim_mijlpalen (
  id uuid primary key default gen_random_uuid(),
  verzuim_id text references public.verzuim(id) on delete cascade,
  mijlpaal_type text,
  deadline_datum date,
  voltooid_op date,
  data jsonb,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);

create table if not exists public.verzuim_contactmomenten (
  id uuid primary key default gen_random_uuid(),
  verzuim_id text references public.verzuim(id) on delete cascade,
  datum date,
  type text,
  notitie text,
  uitgevoerd_door uuid,
  data jsonb,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);

create index if not exists idx_verzuim_mijlpalen_verzuim on public.verzuim_mijlpalen(verzuim_id);
create index if not exists idx_verzuim_mijlpalen_deadline on public.verzuim_mijlpalen(deadline_datum) where voltooid_op is null;
create index if not exists idx_verzuim_contactmomenten_verzuim on public.verzuim_contactmomenten(verzuim_id);

alter table public.verzuim_mijlpalen enable row level security;
alter table public.verzuim_contactmomenten enable row level security;

-- verzuim_mijlpalen: office-only (was: open 'true')
drop policy if exists "auth kan verzuim_mijlpalen lezen" on public.verzuim_mijlpalen;
drop policy if exists "auth kan verzuim_mijlpalen toevoegen" on public.verzuim_mijlpalen;
drop policy if exists "auth kan verzuim_mijlpalen bewerken" on public.verzuim_mijlpalen;
drop policy if exists "auth kan verzuim_mijlpalen verwijderen" on public.verzuim_mijlpalen;
drop policy if exists "vmijl_select_office" on public.verzuim_mijlpalen;
drop policy if exists "vmijl_insert_office" on public.verzuim_mijlpalen;
drop policy if exists "vmijl_update_office" on public.verzuim_mijlpalen;
drop policy if exists "vmijl_delete_office" on public.verzuim_mijlpalen;
create policy "vmijl_select_office" on public.verzuim_mijlpalen for select to authenticated using (public.is_office_staff());
create policy "vmijl_insert_office" on public.verzuim_mijlpalen for insert to authenticated with check (public.is_office_staff());
create policy "vmijl_update_office" on public.verzuim_mijlpalen for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
create policy "vmijl_delete_office" on public.verzuim_mijlpalen for delete to authenticated using (public.is_office_staff());

-- verzuim_contactmomenten: office-only (was: open 'true')
drop policy if exists "auth kan verzuim_contactmomenten lezen" on public.verzuim_contactmomenten;
drop policy if exists "auth kan verzuim_contactmomenten toevoegen" on public.verzuim_contactmomenten;
drop policy if exists "auth kan verzuim_contactmomenten bewerken" on public.verzuim_contactmomenten;
drop policy if exists "auth kan verzuim_contactmomenten verwijderen" on public.verzuim_contactmomenten;
drop policy if exists "vcontact_select_office" on public.verzuim_contactmomenten;
drop policy if exists "vcontact_insert_office" on public.verzuim_contactmomenten;
drop policy if exists "vcontact_update_office" on public.verzuim_contactmomenten;
drop policy if exists "vcontact_delete_office" on public.verzuim_contactmomenten;
create policy "vcontact_select_office" on public.verzuim_contactmomenten for select to authenticated using (public.is_office_staff());
create policy "vcontact_insert_office" on public.verzuim_contactmomenten for insert to authenticated with check (public.is_office_staff());
create policy "vcontact_update_office" on public.verzuim_contactmomenten for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
create policy "vcontact_delete_office" on public.verzuim_contactmomenten for delete to authenticated using (public.is_office_staff());

-- verzuim: insert/update/delete aanscherpen naar office (select was al office)
drop policy if exists "verzuim_insert_open_authenticated" on public.verzuim;
drop policy if exists "verzuim_update_open_authenticated" on public.verzuim;
drop policy if exists "verzuim_delete_open_authenticated" on public.verzuim;
drop policy if exists "verzuim_insert_office" on public.verzuim;
drop policy if exists "verzuim_update_office" on public.verzuim;
drop policy if exists "verzuim_delete_office" on public.verzuim;
create policy "verzuim_insert_office" on public.verzuim for insert to authenticated with check (public.is_office_staff());
create policy "verzuim_update_office" on public.verzuim for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
create policy "verzuim_delete_office" on public.verzuim for delete to authenticated using (public.is_office_staff());

-- ----------------------------------------------------------------------------
-- G47 — verzuim.medewerker_id: koppeling naar medewerker voor betrouwbare KPI's.
-- Type = text (consistent met medewerker_verzuim_perioden.medewerker_id; geen harde
-- FK omdat medewerkers.id uuid is en historisch text-koppeling de norm is). Nullable;
-- nieuwe cases vullen 'm via de UI. Backfill via naam-match volgt bij KPI-bouw.
-- ----------------------------------------------------------------------------

alter table public.verzuim
  add column if not exists medewerker_id text;

create index if not exists idx_verzuim_medewerker_id on public.verzuim(medewerker_id) where medewerker_id is not null;

select 'hr_v4_fase0_fundament OK' as result;
