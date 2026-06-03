-- Financiën › Locaties — handmatige onkosten per locatie (huur, boodschappen, energie, water, ...).
-- Toegepast via Supabase MCP (apply_migration). Vervolg op financien_locaties_dashboard.sql.
--
-- Toegang uitgebreid: naast Eigenaar + Directeur mag nu ook de Finance-rol
-- (degene die de financiën/declaraties regelt) de Financiën-tab in en onkosten
-- invoeren/aanpassen. Admin blijft uitgesloten (strict, geen admin-bypass).
--
-- bedrag = bedrag PER MAAND; telt voor elke maand in [van_ym .. coalesce(tot_ym, doorlopend)].
-- Eenmalige kost: van_ym = tot_ym = die maand. Doorlopend: tot_ym = NULL.
--
-- De RPC's financien_locaties_dashboard() en financien_locatie_maand_detail()
-- zijn uitgebreid (zie Supabase-migratiehistorie financien_dashboard_met_onkosten /
-- financien_detail_met_onkosten): kosten = ZZP-kosten + onkosten; resultaat =
-- opbrengst − (ZZP + onkosten); detail retourneert een onkosten[]-lijst per locatie.

-- 1) Toegang: Finance erbij.
create or replace function public.can_view_financien()
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in ('eigenaar','directeur','finance')
  );
$$;

-- 2) Onkosten-tabel.
create table if not exists public.financien_locatie_onkosten (
  id uuid primary key default gen_random_uuid(),
  locatie text not null,
  categorie text not null,
  omschrijving text,
  bedrag numeric not null default 0,         -- per maand
  van_ym text not null,                      -- 'YYYY-MM' startmaand
  tot_ym text,                               -- 'YYYY-MM' eindmaand; NULL = doorlopend
  archived boolean not null default false,
  aangemaakt_door text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

alter table public.financien_locatie_onkosten enable row level security;

-- 3) RLS: uitsluitend Eigenaar/Directeur/Finance lezen + schrijven. Geen hard delete (DIEHARD → soft via archived).
drop policy if exists fin_onk_select on public.financien_locatie_onkosten;
create policy fin_onk_select on public.financien_locatie_onkosten for select to authenticated using (public.can_view_financien());
drop policy if exists fin_onk_insert on public.financien_locatie_onkosten;
create policy fin_onk_insert on public.financien_locatie_onkosten for insert to authenticated with check (public.can_view_financien());
drop policy if exists fin_onk_update on public.financien_locatie_onkosten;
create policy fin_onk_update on public.financien_locatie_onkosten for update to authenticated using (public.can_view_financien()) with check (public.can_view_financien());

create index if not exists idx_fin_onk_loc on public.financien_locatie_onkosten (locatie) where not archived;