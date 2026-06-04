-- Financiën › Overhead/Kantoor — handmatige personeelskosten (overhead).
-- Toegepast via Supabase MCP (apply_migration: financien_overhead_personeel).
--
-- Doel: overheadmedewerkers die NIET op een zorggroep staan en dus niet via de
-- ZZP-planning meegerekend worden — gedragswetenschappers, zorgcoördinator, HR,
-- facilitair, … — als maandelijkse kostenpost kunnen invoeren onder de (virtuele)
-- locatie "Kantoor". Loondienst die wél op een groep staat kan ook ingevoerd worden
-- onder de betreffende locatie.
--
-- maandkost = wat de medewerker per maand het bedrijf kost (telt mee in de uitgaven):
--   loondienst → bruto_maand × (1 + werkgeverslasten_pct/100)   (werkgeverskosten)
--   zzp        → zzp_maand                                       (maandelijks factuurbedrag)
-- netto_maand is puur informatief (indicatief, optioneel).
--
-- Toegang: zelfde strikte rol-gate als de rest van Financiën — can_view_financien()
-- (Eigenaar/Directeur/Finance). Geen hard delete (DIEHARD → soft via archived).
--
-- De RPC's financien_locaties_dashboard() en financien_locatie_maand_detail() zijn
-- uitgebreid zodat deze personeelskosten per locatie/maand meetellen
-- (kosten = ZZP + onkosten + personeel); zie financien_locaties_dashboard.sql
-- (migraties financien_dashboard_met_personeel / financien_detail_met_personeel).

create table if not exists public.financien_overhead_personeel (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  functie text,                                       -- vrij: Gedragswetenschapper, Zorgcoördinator, HR, Facilitair, …
  dienstverband text not null default 'loondienst',   -- 'loondienst' | 'zzp'
  locatie text not null default 'Kantoor',            -- afdeling; default overhead-bucket "Kantoor"
  bruto_maand numeric not null default 0,             -- loondienst: bruto maandsalaris (op papier)
  werkgeverslasten_pct numeric not null default 30,   -- loondienst: opslag % → werkgeverskosten
  netto_maand numeric,                                -- loondienst: indicatief netto (optioneel)
  zzp_maand numeric not null default 0,               -- zzp: maandbedrag (= maandkost)
  maandkost numeric generated always as (
    case when dienstverband = 'zzp' then coalesce(zzp_maand,0)
         else coalesce(bruto_maand,0) * (1 + coalesce(werkgeverslasten_pct,0)/100.0)
    end
  ) stored,
  van_ym text not null,                               -- 'YYYY-MM' startmaand
  tot_ym text,                                        -- 'YYYY-MM' eindmaand; NULL = doorlopend
  archived boolean not null default false,
  aangemaakt_door text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  constraint financien_overhead_personeel_dienstverband_chk check (dienstverband in ('loondienst','zzp'))
);

alter table public.financien_overhead_personeel enable row level security;

-- RLS: uitsluitend Eigenaar/Directeur/Finance lezen + schrijven. Geen hard delete.
drop policy if exists fin_pers_select on public.financien_overhead_personeel;
create policy fin_pers_select on public.financien_overhead_personeel for select to authenticated using (public.can_view_financien());
drop policy if exists fin_pers_insert on public.financien_overhead_personeel;
create policy fin_pers_insert on public.financien_overhead_personeel for insert to authenticated with check (public.can_view_financien());
drop policy if exists fin_pers_update on public.financien_overhead_personeel;
create policy fin_pers_update on public.financien_overhead_personeel for update to authenticated using (public.can_view_financien()) with check (public.can_view_financien());

create index if not exists idx_fin_pers_loc on public.financien_overhead_personeel (locatie) where not archived;
