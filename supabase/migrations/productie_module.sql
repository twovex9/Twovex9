-- =====================================================================
-- productie_module.sql — Module 2: Productie & Urenregistratie (ETF)
-- ---------------------------------------------------------------------
-- Bouwt op de bestaande tabellen werkuren / urendeclaraties / beschikkingen.
-- Voegt toe:
--   1. Toegekende omvang per beschikking (uren + eenheid) + auto-seed uit de
--      beschikking-naam ("14 u p week").
--   2. Twee nieuwe tabellen: maandafsluiting + overschrijding-goedkeuring.
--   3. Rol-context-RPC productie_mijn_context() (niveau / kan_beheren / is_directie)
--      — hergebruikt de bestaande _taken_kijk_niveau(auth.uid()).
--   4. Beschikkingsbewaking-RPC: uren-verbruik vs toegekend → groen/oranje/rood.
--   5. Kostendashboards: ZZP/inhuur (uren × uurAlgemeen) en loondienst
--      (maandsalaris + benuttingsgraad).
--   6. KPI-RPC (4 KPI's).
--   7. Maandafsluiting + overschrijding-beslis-RPC's (audit + notificatie).
--
-- Volledig idempotent. Goedkeuring/afsluiten gegate op niveau <= 3 (management),
-- heropenen op niveau <= 2 (directie). Conform werkpatronen: RLS authenticated-only.
--
-- Uitvoeren op productie (ukjflilnhigozfoxowmj):
--   node scripts/db-exec.mjs --file supabase/migrations/productie_module.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Toegekende omvang per beschikking + auto-seed
-- ---------------------------------------------------------------------
alter table public.beschikkingen
  add column if not exists toegekend_uren    numeric,
  add column if not exists toegekend_eenheid text,   -- 'week' | 'maand' | 'totaal'
  add column if not exists toegekend_bron    text;   -- 'auto' | 'handmatig'

-- Seed alleen uur-beschikkingen waar de naam een "N u (p) week/maand" bevat en
-- er nog niets is ingevuld. Komma → punt voor de cast. Beschikkingen zonder
-- duidelijke omvang (Ambulant/Gecombineerd/dag-verblijf) blijven NULL =
-- "onbekend" in de bewaking (de beheerder vult ze in via de UI).
update public.beschikkingen b
set
  toegekend_uren = nullif(replace((regexp_match(b.naam, '(\d+(?:[.,]\d+)?)\s*u'))[1], ',', '.'), '')::numeric,
  toegekend_eenheid = case when b.naam ilike '%maand%' then 'maand' else 'week' end,
  toegekend_bron = 'auto'
where coalesce(b.tarief_eenheid, '') = 'uur'
  and b.toegekend_uren is null
  and b.naam ~ '(\d+(?:[.,]\d+)?)\s*u';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'beschikkingen_toegekend_eenheid_check') then
    alter table public.beschikkingen
      add constraint beschikkingen_toegekend_eenheid_check
      check (toegekend_eenheid is null or toegekend_eenheid in ('week','maand','totaal'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Nieuwe tabellen (vóór de functies — SQL-functies valideren referenties
--    bij CREATE).
-- ---------------------------------------------------------------------
create table if not exists public.productie_maandafsluiting (
  id                  uuid primary key default gen_random_uuid(),
  jaar                int  not null,
  maand               int  not null,
  status              text not null default 'open',  -- 'open' | 'afgesloten'
  afgesloten_door     uuid,
  afgesloten_door_naam text,
  afgesloten_op       timestamptz,
  heropend_door       uuid,
  heropend_door_naam  text,
  heropend_op         timestamptz,
  snapshot            jsonb,
  notitie             text,
  aanmaakdatum        timestamptz default now(),
  laatst_gewijzigd    timestamptz default now(),
  unique (jaar, maand)
);
alter table public.productie_maandafsluiting enable row level security;
drop policy if exists "auth kan productie_maandafsluiting lezen" on public.productie_maandafsluiting;
create policy "auth kan productie_maandafsluiting lezen"
  on public.productie_maandafsluiting for select to authenticated using (true);
drop policy if exists "auth kan productie_maandafsluiting schrijven" on public.productie_maandafsluiting;
create policy "auth kan productie_maandafsluiting schrijven"
  on public.productie_maandafsluiting for insert to authenticated with check (true);
drop policy if exists "auth kan productie_maandafsluiting bewerken" on public.productie_maandafsluiting;
create policy "auth kan productie_maandafsluiting bewerken"
  on public.productie_maandafsluiting for update to authenticated using (true) with check (true);

create table if not exists public.productie_overschrijding_goedkeuring (
  id                   uuid primary key default gen_random_uuid(),
  beschikking_id       text not null references public.beschikkingen(id) on delete cascade,
  jaar                 int  not null,
  maand                int  not null,
  status               text not null default 'open',  -- 'open' | 'goedgekeurd' | 'afgewezen'
  verbruik_uren        numeric,
  toegekend_uren       numeric,
  reden                text,
  besloten_door        uuid,
  besloten_door_naam   text,
  besloten_op          timestamptz,
  aanmaakdatum         timestamptz default now(),
  laatst_gewijzigd     timestamptz default now()
);
create index if not exists prod_oversch_besch_idx on public.productie_overschrijding_goedkeuring (beschikking_id, jaar, maand);
alter table public.productie_overschrijding_goedkeuring enable row level security;
drop policy if exists "auth kan productie_oversch lezen" on public.productie_overschrijding_goedkeuring;
create policy "auth kan productie_oversch lezen"
  on public.productie_overschrijding_goedkeuring for select to authenticated using (true);
drop policy if exists "auth kan productie_oversch schrijven" on public.productie_overschrijding_goedkeuring;
create policy "auth kan productie_oversch schrijven"
  on public.productie_overschrijding_goedkeuring for insert to authenticated with check (true);
drop policy if exists "auth kan productie_oversch bewerken" on public.productie_overschrijding_goedkeuring;
create policy "auth kan productie_oversch bewerken"
  on public.productie_overschrijding_goedkeuring for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3. Hulpfuncties: client-normalisatie + niveau-context + naam-helper
-- ---------------------------------------------------------------------
-- werkuren.client_id is gemengd (clienten.id "cl_NNN" óf de bs2-UUID).
-- beschikkingen.client_id = de bs2-UUID (= clienten.data->>'bs2_id').
-- Deze functie normaliseert elke werkuren-client naar de beschikking-stijl id.
create or replace function public.productie_norm_client(p_client_id text)
returns text
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select c.data->>'bs2_id' from public.clienten c where c.id = p_client_id),
    p_client_id
  );
$$;

create or replace function public._productie_naam(p_user uuid)
returns text
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select trim(coalesce(m.voornaam,'') || ' ' || coalesce(m.achternaam,''))
       from public.medewerkers m
       join public.profiles p on p.medewerker_id = m.id
      where p.id = p_user),
    (select trim(coalesce(p.voornaam,'') || ' ' || coalesce(p.achternaam,'')) from public.profiles p where p.id = p_user),
    (select p.email from public.profiles p where p.id = p_user)
  );
$$;

-- Rol-context voor de UI (hergebruikt het taken-niveaumodel).
create or replace function public.productie_mijn_context()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'niveau',      public._taken_kijk_niveau(auth.uid()),
    'kan_beheren', public._taken_kijk_niveau(auth.uid()) <= 3,
    'is_directie', public._taken_kijk_niveau(auth.uid()) <= 2
  );
$$;
grant execute on function public.productie_mijn_context() to authenticated;
grant execute on function public.productie_norm_client(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Beschikkingsbewaking: uren-verbruik vs toegekend → groen/oranje/rood
--    Verbruik = geregistreerde werkuren van de cliënt binnen het overlap-
--    venster van de beschikking met de gevraagde periode. Toegekend wordt
--    geprojecteerd over datzelfde venster (week/maand/totaal-pro-rata).
--    Drempels: groen <85% · oranje 85-100% · rood >100%.
--    Alleen voor management (niveau <= 3); anders leeg.
-- ---------------------------------------------------------------------
create or replace function public.productie_beschikking_bewaking(
  p_start date default null, p_end date default null)
returns table(
  beschikking_id text, client_id text, client_label text, naam text,
  zorgsoort text, locatie text, fase text,
  start_iso date, eind_iso date,
  tarief_eur numeric, tarief_eenheid text,
  toegekend_uren numeric, toegekend_eenheid text, toegekend_bron text,
  toegekend_periode numeric, verbruik_uren numeric, verbruik_pct numeric,
  status text, goedkeuring_status text
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select
      coalesce(p_start, date_trunc('month', (now() at time zone 'Europe/Amsterdam'))::date) as ps,
      coalesce(p_end, (date_trunc('month', (now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date) as pe
  ),
  wu as (
    select public.productie_norm_client(w.client_id) as client_id,
           w.datum, sum(coalesce(w.duur_minuten,0))/60.0 as uren
    from public.werkuren w
    where w.client_id is not null
    group by 1, 2
  ),
  besch as (
    select b.id, b.client_id, b.naam, b.zorgsoort_key, b.locatie, b.fase,
           b.start_iso, b.eind_iso, b.tarief_eur, b.tarief_eenheid,
           b.toegekend_uren, b.toegekend_eenheid, b.toegekend_bron,
           greatest(coalesce(b.start_iso, (select ps from params)), (select ps from params)) as w_start,
           least(coalesce(b.eind_iso, (select pe from params)), (select pe from params))   as w_end
    from public.beschikkingen b
    where coalesce(b.gearchiveerd, false) = false
      and coalesce(b.fase, '') not in ('In aanvraag')
      and coalesce(b.start_iso, (select ps from params)) <= (select pe from params)
      and coalesce(b.eind_iso, (select pe from params))  >= (select ps from params)
  ),
  calc as (
    select bs.*,
      coalesce((
        select sum(wu.uren) from wu
        where wu.client_id = bs.client_id
          and wu.datum between bs.w_start and bs.w_end
      ), 0) as verbruik_uren,
      case
        when bs.toegekend_uren is null or bs.toegekend_uren <= 0 then null
        when bs.toegekend_eenheid = 'week'  then bs.toegekend_uren * ((bs.w_end - bs.w_start + 1)::numeric / 7.0)
        when bs.toegekend_eenheid = 'maand' then bs.toegekend_uren * ((bs.w_end - bs.w_start + 1)::numeric / 30.44)
        when bs.toegekend_eenheid = 'totaal' then bs.toegekend_uren *
          ( (bs.w_end - bs.w_start + 1)::numeric
            / nullif((least(coalesce(bs.eind_iso, bs.w_end), bs.w_end) - greatest(coalesce(bs.start_iso, bs.w_start), bs.w_start) + 1), 0)::numeric )
        else null
      end as toegekend_periode
    from besch bs
  )
  select
    c.id, c.client_id,
    coalesce((select cl.data->>'clientLabelOverride' from public.clienten cl where (cl.data->>'bs2_id') = c.client_id),
             (select (cl.voornaam || ' ' || cl.achternaam) from public.clienten cl where (cl.data->>'bs2_id') = c.client_id),
             c.client_id) as client_label,
    c.naam, c.zorgsoort_key, c.locatie, c.fase,
    c.start_iso, c.eind_iso, c.tarief_eur, c.tarief_eenheid,
    c.toegekend_uren, c.toegekend_eenheid, c.toegekend_bron,
    round(c.toegekend_periode, 2) as toegekend_periode,
    round(c.verbruik_uren, 2) as verbruik_uren,
    case when c.toegekend_periode is null or c.toegekend_periode <= 0 then null
         else round(c.verbruik_uren / c.toegekend_periode * 100, 1) end as verbruik_pct,
    case
      when c.toegekend_periode is null or c.toegekend_periode <= 0 then 'onbekend'
      when c.verbruik_uren / c.toegekend_periode > 1.0  then 'rood'
      when c.verbruik_uren / c.toegekend_periode >= 0.85 then 'oranje'
      else 'groen'
    end as status,
    (
      select g.status from public.productie_overschrijding_goedkeuring g
      where g.beschikking_id = c.id
        and g.jaar = extract(year from (select ps from params))::int
        and g.maand = extract(month from (select ps from params))::int
      order by g.laatst_gewijzigd desc limit 1
    ) as goedkeuring_status
  from calc c
  where public._taken_kijk_niveau(auth.uid()) <= 3
  order by
    case when c.toegekend_periode is null or c.toegekend_periode <= 0 then 2
         when c.verbruik_uren / c.toegekend_periode > 1.0 then 0 else 1 end,
    (case when c.toegekend_periode > 0 then c.verbruik_uren / c.toegekend_periode else 0 end) desc;
$function$;
grant execute on function public.productie_beschikking_bewaking(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5a. ZZP/inhuur-kostendashboard: gewerkte uren × persoonlijk uurtarief
-- ---------------------------------------------------------------------
create or replace function public.productie_kosten_zzp(
  p_start date default null, p_end date default null)
returns table(
  medewerker_id uuid, naam text, dienstverband text,
  uurtarief numeric, verbruik_uren numeric, kosten numeric
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select coalesce(p_start, date_trunc('month', (now() at time zone 'Europe/Amsterdam'))::date) as ps,
           coalesce(p_end, (date_trunc('month', (now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date) as pe
  ),
  uren as (
    select w.medewerker_id, sum(coalesce(w.duur_minuten,0))/60.0 as uren
    from public.werkuren w, params
    where w.datum between params.ps and params.pe
    group by w.medewerker_id
  )
  select m.id, trim(coalesce(m.voornaam,'') || ' ' || coalesce(m.achternaam,'')) as naam,
         m.dienstverband,
         nullif(m.data->>'uurAlgemeen','')::numeric as uurtarief,
         round(coalesce(u.uren,0), 2) as verbruik_uren,
         round(coalesce(u.uren,0) * coalesce(nullif(m.data->>'uurAlgemeen','')::numeric, 0), 2) as kosten
  from public.medewerkers m
  left join uren u on u.medewerker_id = m.id
  where coalesce(m.archived,false) = false
    and m.dienstverband = 'Inhuur'
    and public._taken_kijk_niveau(auth.uid()) <= 3
    and coalesce(u.uren,0) > 0
  order by kosten desc;
$function$;
grant execute on function public.productie_kosten_zzp(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5b. Loondienst-kostendashboard: maandsalaris + benuttingsgraad
--     Kosten = maandbruto × aantal maanden in de periode (pro-rata).
--     Benutting = gewerkte (declarabele) uren / beschikbare contracturen.
-- ---------------------------------------------------------------------
create or replace function public.productie_kosten_loondienst(
  p_start date default null, p_end date default null)
returns table(
  medewerker_id uuid, naam text, dienstverband text,
  contracturen numeric, maandsalaris numeric,
  gewerkte_uren numeric, beschikbare_uren numeric,
  benutting_pct numeric, kosten numeric
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select coalesce(p_start, date_trunc('month', (now() at time zone 'Europe/Amsterdam'))::date) as ps,
           coalesce(p_end, (date_trunc('month', (now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date) as pe
  ),
  span as (
    select ps, pe, (pe - ps + 1) as dagen,
           (pe - ps + 1)::numeric / 30.44 as maanden,
           (pe - ps + 1)::numeric / 7.0   as weken
    from params
  ),
  uren as (
    select w.medewerker_id, sum(coalesce(w.duur_minuten,0))/60.0 as uren
    from public.werkuren w, span
    where w.datum between span.ps and span.pe
    group by w.medewerker_id
  )
  select m.id, trim(coalesce(m.voornaam,'') || ' ' || coalesce(m.achternaam,'')) as naam,
         m.dienstverband,
         nullif(m.data->>'contracturen','')::numeric as contracturen,
         nullif(m.data->>'salaris','')::numeric as maandsalaris,
         round(coalesce(u.uren,0), 2) as gewerkte_uren,
         round(coalesce(nullif(m.data->>'contracturen','')::numeric,0) * (select weken from span), 2) as beschikbare_uren,
         case when coalesce(nullif(m.data->>'contracturen','')::numeric,0) > 0
              then round(coalesce(u.uren,0) / (nullif(m.data->>'contracturen','')::numeric * (select weken from span)) * 100, 1)
              else null end as benutting_pct,
         round(coalesce(nullif(m.data->>'salaris','')::numeric,0) * (select maanden from span), 2) as kosten
  from public.medewerkers m
  left join uren u on u.medewerker_id = m.id
  where coalesce(m.archived,false) = false
    and m.dienstverband = 'Loondienst'
    and public._taken_kijk_niveau(auth.uid()) <= 3
  order by kosten desc;
$function$;
grant execute on function public.productie_kosten_loondienst(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6. KPI-RPC (4 KPI's voor het directie-dashboard)
--    1. Geregistreerde productie-uren (periode)
--    2. Beschikkingen in overschrijding (rood) + verdeling groen/oranje/rood
--    3. ZZP-inhuurkosten (periode)
--    4. Loondienst-benuttingsgraad (gemiddeld)
-- ---------------------------------------------------------------------
create or replace function public.productie_kpis(
  p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_ps date := coalesce(p_start, date_trunc('month', (now() at time zone 'Europe/Amsterdam'))::date);
  v_pe date := coalesce(p_end, (date_trunc('month', (now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date);
  v_uren numeric;
  v_groen int; v_oranje int; v_rood int; v_onbekend int; v_gemonitord int;
  v_zzp numeric; v_loon_benut numeric;
begin
  if public._taken_kijk_niveau(auth.uid()) > 3 then
    return jsonb_build_object('niveau_te_laag', true);
  end if;

  select coalesce(sum(coalesce(duur_minuten,0))/60.0, 0) into v_uren
  from public.werkuren where datum between v_ps and v_pe;

  select
    count(*) filter (where status = 'groen'),
    count(*) filter (where status = 'oranje'),
    count(*) filter (where status = 'rood'),
    count(*) filter (where status = 'onbekend')
  into v_groen, v_oranje, v_rood, v_onbekend
  from public.productie_beschikking_bewaking(v_ps, v_pe);
  v_gemonitord := coalesce(v_groen,0) + coalesce(v_oranje,0) + coalesce(v_rood,0);

  select coalesce(sum(kosten),0) into v_zzp
  from public.productie_kosten_zzp(v_ps, v_pe);

  select round(avg(benutting_pct), 1) into v_loon_benut
  from public.productie_kosten_loondienst(v_ps, v_pe)
  where benutting_pct is not null;

  return jsonb_build_object(
    'productie_uren',   round(coalesce(v_uren,0), 1),
    'rood',             coalesce(v_rood,0),
    'oranje',           coalesce(v_oranje,0),
    'groen',            coalesce(v_groen,0),
    'onbekend',         coalesce(v_onbekend,0),
    'gemonitord',       v_gemonitord,
    'overschrijding_pct', case when v_gemonitord > 0 then round(coalesce(v_rood,0)::numeric / v_gemonitord * 100, 0) else 0 end,
    'zzp_kosten',       coalesce(v_zzp,0),
    'loondienst_benutting', v_loon_benut
  );
end;
$function$;
grant execute on function public.productie_kpis(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Maandafsluiting + overschrijding-beslis + toegekend-bijwerken
-- ---------------------------------------------------------------------
create or replace function public.productie_maand_afsluiten(p_jaar int, p_maand int, p_notitie text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_naam text := public._productie_naam(auth.uid());
  v_ps date; v_pe date; v_snap jsonb;
begin
  if public._taken_kijk_niveau(v_uid) > 3 then
    raise exception 'Geen rechten om een maand af te sluiten (alleen management).';
  end if;
  if p_maand < 1 or p_maand > 12 then raise exception 'Ongeldige maand'; end if;
  v_ps := make_date(p_jaar, p_maand, 1);
  v_pe := (v_ps + interval '1 month - 1 day')::date;
  v_snap := public.productie_kpis(v_ps, v_pe);

  insert into public.productie_maandafsluiting
    (jaar, maand, status, afgesloten_door, afgesloten_door_naam, afgesloten_op, snapshot, notitie, laatst_gewijzigd)
  values (p_jaar, p_maand, 'afgesloten', v_uid, v_naam, now(), v_snap, p_notitie, now())
  on conflict (jaar, maand) do update set
    status = 'afgesloten', afgesloten_door = v_uid, afgesloten_door_naam = v_naam,
    afgesloten_op = now(), snapshot = v_snap, notitie = coalesce(p_notitie, public.productie_maandafsluiting.notitie),
    heropend_door = null, heropend_door_naam = null, heropend_op = null, laatst_gewijzigd = now();

  return jsonb_build_object('ok', true, 'jaar', p_jaar, 'maand', p_maand, 'snapshot', v_snap);
end;
$function$;
grant execute on function public.productie_maand_afsluiten(int, int, text) to authenticated;

create or replace function public.productie_maand_heropenen(p_jaar int, p_maand int)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_naam text := public._productie_naam(auth.uid());
begin
  if public._taken_kijk_niveau(v_uid) > 2 then
    raise exception 'Alleen directie/eigenaar mag een afgesloten maand heropenen.';
  end if;
  update public.productie_maandafsluiting
     set status = 'open', heropend_door = v_uid, heropend_door_naam = v_naam,
         heropend_op = now(), laatst_gewijzigd = now()
   where jaar = p_jaar and maand = p_maand;
  return jsonb_build_object('ok', true, 'jaar', p_jaar, 'maand', p_maand);
end;
$function$;
grant execute on function public.productie_maand_heropenen(int, int) to authenticated;

-- Beslis over een overschrijding (goedkeuren/afwijzen) door management (niveau <=3).
-- Legt beslisser + reden vast en meldt de directie/eigenaar (niveau <= 2).
create or replace function public.productie_overschrijding_beslis(
  p_beschikking_id text, p_jaar int, p_maand int, p_status text, p_reden text default null,
  p_verbruik numeric default null, p_toegekend numeric default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_naam text := public._productie_naam(auth.uid());
  v_besch_naam text;
  v_client text;
  v_id uuid;
begin
  if public._taken_kijk_niveau(v_uid) > 3 then
    raise exception 'Geen rechten om een overschrijding te beoordelen (alleen management).';
  end if;
  if p_status not in ('open','goedgekeurd','afgewezen') then
    raise exception 'Ongeldige status: %', p_status;
  end if;

  select b.naam, coalesce(
           (select cl.data->>'clientLabelOverride' from public.clienten cl where (cl.data->>'bs2_id') = b.client_id),
           (select (cl.voornaam || ' ' || cl.achternaam) from public.clienten cl where (cl.data->>'bs2_id') = b.client_id),
           b.client_id)
    into v_besch_naam, v_client
  from public.beschikkingen b where b.id = p_beschikking_id;

  update public.productie_overschrijding_goedkeuring
     set status = p_status, reden = coalesce(p_reden, reden),
         verbruik_uren = coalesce(p_verbruik, verbruik_uren),
         toegekend_uren = coalesce(p_toegekend, toegekend_uren),
         besloten_door = case when p_status <> 'open' then v_uid else besloten_door end,
         besloten_door_naam = case when p_status <> 'open' then v_naam else besloten_door_naam end,
         besloten_op = case when p_status <> 'open' then now() else besloten_op end,
         laatst_gewijzigd = now()
   where beschikking_id = p_beschikking_id and jaar = p_jaar and maand = p_maand
   returning id into v_id;

  if v_id is null then
    insert into public.productie_overschrijding_goedkeuring
      (beschikking_id, jaar, maand, status, reden, verbruik_uren, toegekend_uren,
       besloten_door, besloten_door_naam, besloten_op)
    values (p_beschikking_id, p_jaar, p_maand, p_status, p_reden, p_verbruik, p_toegekend,
       case when p_status <> 'open' then v_uid else null end,
       case when p_status <> 'open' then v_naam else null end,
       case when p_status <> 'open' then now() else null end)
    returning id into v_id;
  end if;

  if p_status <> 'open' then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select pr.id, 'productie_overschrijding',
           'Beschikking-overschrijding ' || p_status || ': ' || coalesce(v_client, v_besch_naam),
           coalesce(v_naam,'Iemand') || ' heeft een overschrijding van ''' || coalesce(v_besch_naam,'beschikking')
             || ''' (' || lpad(p_maand::text,2,'0') || '-' || p_jaar || ') ' || p_status || '.',
           'productie', p_beschikking_id
    from public.profiles pr
    where public._taken_kijk_niveau(pr.id) <= 2
      and pr.id is distinct from v_uid;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_status);
end;
$function$;
grant execute on function public.productie_overschrijding_beslis(text, int, int, text, text, numeric, numeric) to authenticated;

-- Toegekende omvang van een beschikking bijwerken (management, niveau <= 3).
create or replace function public.productie_set_toegekend(
  p_beschikking_id text, p_uren numeric, p_eenheid text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if public._taken_kijk_niveau(auth.uid()) > 3 then
    raise exception 'Geen rechten om de toegekende omvang te wijzigen (alleen management).';
  end if;
  if p_eenheid is not null and p_eenheid not in ('week','maand','totaal') then
    raise exception 'Ongeldige eenheid: %', p_eenheid;
  end if;
  update public.beschikkingen
     set toegekend_uren = p_uren,
         toegekend_eenheid = coalesce(p_eenheid, toegekend_eenheid, 'week'),
         toegekend_bron = 'handmatig',
         laatst_gewijzigd = now()
   where id = p_beschikking_id;
  return jsonb_build_object('ok', true);
end;
$function$;
grant execute on function public.productie_set_toegekend(text, numeric, text) to authenticated;
