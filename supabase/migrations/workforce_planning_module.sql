-- =====================================================================
-- workforce_planning_module.sql — Module 3: Workforce Planning + AI-engine (ETF)
-- ---------------------------------------------------------------------
-- Strategisch personeelsplanning-overzicht bovenop de bestaande tabellen
-- planning / medewerkers / beschikkingen / medewerker_beschikbaarheid.
-- Voegt toe:
--   1. Beslissingen-tabel voor AI-aanbevelingen (open/opgepakt/afgewezen),
--      gekeyd op een deterministische `sleutel` (zelfde patroon als
--      productie_overschrijding_goedkeuring uit Module 2).
--   2. Rol-context-RPC workforce_mijn_context() (niveau / kan_beheren / is_directie)
--      — hergebruikt _taken_kijk_niveau(auth.uid()).
--   3. Capaciteit & tekorten: per locatie vraag-uren (alle diensten) vs
--      gevuld/open + loondienst-voorkeurcapaciteit → dekkingsgraad groen/oranje/rood.
--   4. AI-aanbevelingen-engine: deterministische heuristieken (personeelstekort,
--      onbenutte loondienst-capaciteit, lage benutting, skill/BHV-risico, forecast)
--      → geprioriteerde, onderbouwde adviezen met geschatte uren/€-impact.
--   5. Skills & dekking: per locatie team-grootte + BHV/medicatie/kernteam-dekking.
--   6. Forecast: vraag vs open per locatie per week (komende N weken).
--   7. KPI-RPC (strategisch directie-dashboard).
--   8. Beslis-RPC: advies opvolgen/afwijzen (audit + notificatie directie).
--
-- "AI" = deterministische regel-/heuristiek-engine, consistent met de
-- bestaande planning-generator + planning_ai_weekend_regels.sql. Volledig
-- idempotent. Management-RPC's gegate op niveau <= 3; directie-acties <= 2.
-- Conform werkpatronen: RLS authenticated-only.
--
-- Uitvoeren op productie (ukjflilnhigozfoxowmj):
--   node scripts/db-exec.mjs --file supabase/migrations/workforce_planning_module.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Beslissingen-tabel voor AI-aanbevelingen (decisions-only; de adviezen
--    zelf worden live berekend, alleen de beslissing persisteert — net als
--    productie_overschrijding_goedkeuring).
-- ---------------------------------------------------------------------
create table if not exists public.workforce_aanbeveling_beslissingen (
  id                   uuid primary key default gen_random_uuid(),
  sleutel              text not null unique,   -- deterministische advies-signatuur
  periode_key          text,                   -- 'YYYY-MM'
  type                 text,                   -- tekort | inzet | overbezetting | skill_gap | forecast
  locatie              text,
  titel                text,
  status               text not null default 'open',  -- 'open' | 'opgepakt' | 'afgewezen'
  impact_uren          numeric,
  impact_eur           numeric,
  notitie              text,
  besloten_door        uuid,
  besloten_door_naam   text,
  besloten_op          timestamptz,
  aanmaakdatum         timestamptz default now(),
  laatst_gewijzigd     timestamptz default now()
);
create index if not exists wf_beslis_periode_idx on public.workforce_aanbeveling_beslissingen (periode_key, type);
alter table public.workforce_aanbeveling_beslissingen enable row level security;
drop policy if exists "auth kan wf_beslis lezen" on public.workforce_aanbeveling_beslissingen;
create policy "auth kan wf_beslis lezen"
  on public.workforce_aanbeveling_beslissingen for select to authenticated using (true);
drop policy if exists "auth kan wf_beslis schrijven" on public.workforce_aanbeveling_beslissingen;
create policy "auth kan wf_beslis schrijven"
  on public.workforce_aanbeveling_beslissingen for insert to authenticated with check (true);
drop policy if exists "auth kan wf_beslis bewerken" on public.workforce_aanbeveling_beslissingen;
create policy "auth kan wf_beslis bewerken"
  on public.workforce_aanbeveling_beslissingen for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 2. Rol-context voor de UI (hergebruikt het taken-niveaumodel).
-- ---------------------------------------------------------------------
create or replace function public.workforce_mijn_context()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'niveau',      public._taken_kijk_niveau(auth.uid()),
    'kan_beheren', public._taken_kijk_niveau(auth.uid()) <= 3,
    'is_directie', public._taken_kijk_niveau(auth.uid()) <= 2
  );
$$;
grant execute on function public.workforce_mijn_context() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Capaciteit & tekorten per locatie
--    Vraag = netto-uren van ALLE niet-gearchiveerde diensten in de periode.
--    Open = diensten zonder teamlid (nog in te vullen). Gevuld = vraag - open.
--    Loondienst-voorkeurcapaciteit = som(contracturen × weken) van loondienst-
--    medewerkers die deze locatie in locatiesSelected hebben (referentie; een
--    medewerker kan meerdere locaties bedienen → bewust als "voorkeur" gelabeld).
--    Dekkingsgraad = gevuld/vraag. Groen >=90% · oranje 70-90% · rood <70%.
--    Alleen voor management (niveau <= 3).
-- ---------------------------------------------------------------------
create or replace function public.workforce_capaciteit(
  p_start date default null, p_end date default null)
returns table(
  locatie text, kleur text,
  diensten_totaal int, open_diensten int, gevulde_diensten int,
  vraag_uren numeric, gevuld_uren numeric, open_uren numeric,
  loondienst_voorkeur_uren numeric,
  dekkingsgraad numeric, status text
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select coalesce(p_start, date_trunc('month',(now() at time zone 'Europe/Amsterdam'))::date) as ps,
           coalesce(p_end, (date_trunc('month',(now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date) as pe
  ),
  span as (select ps, pe, (pe - ps + 1)::numeric / 7.0 as weken from params),
  geldig as (select lower(trim(l.naam)) as ln from public.locaties l where coalesce(l.archived,false) = false),
  diensten as (
    select coalesce(nullif(trim(pl.locatie),''),'(onbekend)') as locatie,
           greatest(0, extract(epoch from (pl.einde_iso - pl.start_iso))/3600.0 - coalesce(pl.pauze_uren,0)) as uren,
           (coalesce(trim(pl.teamlid),'') = '') as is_open
    from public.planning pl, span
    where coalesce(pl.archived,false) = false
      and pl.einde_iso is not null and pl.start_iso is not null
      and pl.start_iso >= span.ps and pl.start_iso < span.pe + 1
      and lower(trim(pl.locatie)) in (select ln from geldig)
  ),
  agg as (
    select locatie,
           count(*)::int as diensten_totaal,
           count(*) filter (where is_open)::int as open_diensten,
           count(*) filter (where not is_open)::int as gevulde_diensten,
           round(coalesce(sum(uren),0),1) as vraag_uren,
           round(coalesce(sum(uren) filter (where not is_open),0),1) as gevuld_uren,
           round(coalesce(sum(uren) filter (where is_open),0),1) as open_uren
    from diensten group by locatie
  ),
  loon as (
    select loc.locatie,
           round(sum(coalesce(nullif(m.data->>'contracturen','')::numeric,0) * (select weken from span)),1) as cap_uren
    from public.medewerkers m
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(m.data->'locatiesSelected') = 'array' then m.data->'locatiesSelected' else '[]'::jsonb end
    ) as loc(locatie)
    where m.dienstverband = 'Loondienst' and coalesce(m.archived,false) = false
    group by loc.locatie
  )
  select a.locatie,
         (select l.kleur from public.locaties l where lower(l.naam) = lower(a.locatie) limit 1) as kleur,
         a.diensten_totaal, a.open_diensten, a.gevulde_diensten,
         a.vraag_uren, a.gevuld_uren, a.open_uren,
         coalesce(lo.cap_uren,0) as loondienst_voorkeur_uren,
         case when a.vraag_uren > 0 then round(a.gevuld_uren / a.vraag_uren * 100, 1) else null end as dekkingsgraad,
         case
           when a.vraag_uren is null or a.vraag_uren <= 0 then 'onbekend'
           when a.gevuld_uren / a.vraag_uren >= 0.90 then 'groen'
           when a.gevuld_uren / a.vraag_uren >= 0.70 then 'oranje'
           else 'rood'
         end as status
  from agg a
  left join loon lo on lower(lo.locatie) = lower(a.locatie)
  where public._taken_kijk_niveau(auth.uid()) <= 3
  order by a.open_uren desc nulls last, a.locatie;
$function$;
grant execute on function public.workforce_capaciteit(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. AI-aanbevelingen-engine — deterministische heuristieken.
--    Elk advies krijgt een stabiele `sleutel` zodat de beslissing
--    (opgepakt/afgewezen) per periode persisteert.
-- ---------------------------------------------------------------------
create or replace function public.workforce_aanbevelingen(
  p_start date default null, p_end date default null)
returns table(
  sleutel text, type text, prioriteit text, locatie text,
  titel text, onderbouwing text, impact_uren numeric, impact_eur numeric,
  data jsonb, status text, besloten_door_naam text, besloten_op timestamptz, notitie text
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select coalesce(p_start, date_trunc('month',(now() at time zone 'Europe/Amsterdam'))::date) as ps,
           coalesce(p_end, (date_trunc('month',(now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date) as pe
  ),
  span as (select ps, pe, (pe - ps + 1)::numeric / 7.0 as weken from params),
  k as (
    select to_char((select ps from params),'YYYY-MM') as pk,
           coalesce((select round(avg(nullif(m.data->>'uurAlgemeen','')::numeric),2)
                       from public.medewerkers m
                      where m.dienstverband = 'Inhuur' and coalesce(m.archived,false) = false), 45) as gz
  ),
  geldig as (select lower(trim(l.naam)) as ln from public.locaties l where coalesce(l.archived,false) = false),
  -- per locatie: vraag/open/dekkingsgraad
  loc_agg as (
    select coalesce(nullif(trim(pl.locatie),''),'(onbekend)') as locatie,
           round(coalesce(sum(greatest(0, extract(epoch from (pl.einde_iso - pl.start_iso))/3600.0 - coalesce(pl.pauze_uren,0))),0),1) as vraag_uren,
           round(coalesce(sum(greatest(0, extract(epoch from (pl.einde_iso - pl.start_iso))/3600.0 - coalesce(pl.pauze_uren,0)))
                 filter (where coalesce(trim(pl.teamlid),'') = ''),0),1) as open_uren,
           count(*) filter (where coalesce(trim(pl.teamlid),'') = '')::int as open_diensten
    from public.planning pl, span
    where coalesce(pl.archived,false) = false
      and pl.einde_iso is not null and pl.start_iso is not null
      and pl.start_iso >= span.ps and pl.start_iso < span.pe + 1
      and lower(trim(pl.locatie)) in (select ln from geldig)
    group by 1
  ),
  loc_dg as (
    select locatie, vraag_uren, open_uren, open_diensten,
           case when vraag_uren > 0 then round((vraag_uren - open_uren)/vraag_uren*100,1) else null end as dekkingsgraad
    from loc_agg
  ),
  -- per loondienst-medewerker: benutting + onbenutte (slack) uren in de periode
  loon_util as (
    select trim(coalesce(m.voornaam,'')||' '||coalesce(m.achternaam,'')) as naam,
           nullif(m.data->>'contracturen','')::numeric as cu,
           nullif(m.data->>'contracturen','')::numeric * (select weken from span) as cap,
           coalesce((
             select sum(greatest(0, extract(epoch from (pl.einde_iso - pl.start_iso))/3600.0 - coalesce(pl.pauze_uren,0)))
             from public.planning pl, span
             where coalesce(pl.archived,false) = false and pl.einde_iso is not null
               and pl.start_iso >= span.ps and pl.start_iso < span.pe + 1
               and lower(trim(pl.teamlid)) = lower(trim(coalesce(m.voornaam,'')||' '||coalesce(m.achternaam,'')))
           ),0) as gepland
    from public.medewerkers m
    where m.dienstverband = 'Loondienst' and coalesce(m.archived,false) = false
      and nullif(m.data->>'contracturen','')::numeric > 0
  ),
  loon_util2 as (
    select naam, cu, round(cap,1) as cap, round(gepland,1) as gepland,
           case when cap > 0 then round(gepland/cap*100,0) else null end as benutting,
           greatest(0, round(cap - gepland,1)) as slack
    from loon_util
  ),
  org as (
    select coalesce(sum(open_uren),0) as tot_open from loc_agg
  ),
  org_slack as (
    select coalesce(sum(slack),0) as tot_slack,
           count(*) filter (where benutting is not null and benutting < 60 and slack > 8)::int as onderbenut_n
    from loon_util2
  ),
  -- skills/BHV-dekking per locatie (voorkeurteam)
  skills as (
    select loc.locatie,
           count(*)::int as team_cnt,
           count(*) filter (where lower(coalesce(m.data->>'trainingBhv','')) = 'true')::int as bhv_cnt,
           count(*) filter (where lower(coalesce(m.data->>'trainingMedicatie','')) = 'true')::int as med_cnt
    from public.medewerkers m
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(m.data->'locatiesSelected') = 'array' then m.data->'locatiesSelected' else '[]'::jsonb end
    ) as loc(locatie)
    where coalesce(m.archived,false) = false
      and lower(trim(loc.locatie)) in (select ln from geldig)
    group by loc.locatie
  ),
  -- beschikkingen-forecast
  besch as (
    select count(*) filter (where b.eind_iso between current_date and current_date + 60)::int as aflopend,
           count(*) filter (where b.start_iso between current_date and current_date + 60)::int as startend
    from public.beschikkingen b where coalesce(b.gearchiveerd,false) = false
  ),
  findings as (
    -- A. Personeelstekort per locatie
    select
      'tekort|'||ld.locatie||'|'||(select pk from k) as sleutel,
      'tekort'::text as type,
      (case when coalesce(ld.dekkingsgraad,0) < 70 then 'hoog' when coalesce(ld.dekkingsgraad,100) < 90 then 'midden' else 'laag' end)::text as prioriteit,
      ld.locatie,
      ('Personeelstekort op '||ld.locatie)::text as titel,
      (ld.open_diensten||' open diensten / '||round(ld.open_uren)::text||' uur onbezet'
        ||coalesce(' (dekkingsgraad '||round(ld.dekkingsgraad)::text||'%)','')
        ||'. Vul de open diensten via de planning-generator of werf extra personeel.')::text as onderbouwing,
      ld.open_uren as impact_uren,
      round(ld.open_uren * (select gz from k)) as impact_eur,
      jsonb_build_object('open_diensten',ld.open_diensten,'open_uren',ld.open_uren,'dekkingsgraad',ld.dekkingsgraad) as data
    from loc_dg ld
    where ld.open_uren > 0 and (ld.dekkingsgraad is null or ld.dekkingsgraad < 90)

    union all
    -- B. Onbenutte loondienst-capaciteit inzetten i.p.v. ZZP (org-breed)
    select
      'inzet|org|'||(select pk from k),
      'inzet',
      (case when least((select tot_slack from org_slack),(select tot_open from org)) * (select gz from k) >= 2000 then 'hoog' else 'midden' end),
      null::text,
      'Onbenutte loondienst-capaciteit inzetten',
      ('Er is '||round((select tot_slack from org_slack))::text||' uur onbenutte loondienst-capaciteit terwijl '
        ||round((select tot_open from org))::text||' uur aan diensten open staat. Plan loondienst eerst i.p.v. ZZP-inhuur — dat bespaart tot ~€'
        ||round(least((select tot_slack from org_slack),(select tot_open from org)) * (select gz from k))::text||' deze periode.'),
      least((select tot_slack from org_slack),(select tot_open from org)),
      round(least((select tot_slack from org_slack),(select tot_open from org)) * (select gz from k)),
      jsonb_build_object('slack_uren',(select tot_slack from org_slack),'open_uren',(select tot_open from org))
    where (select tot_slack from org_slack) > 5 and (select tot_open from org) > 0

    union all
    -- C. Lage benutting loondienst (org-breed, met namen)
    select
      'onderbenutting|org|'||(select pk from k),
      'overbezetting',
      'midden',
      null::text,
      (count(*)::text||' loondienst-medewerker(s) met lage benutting'),
      ('De volgende medewerkers zitten onder 60% benutting: '
        ||string_agg(naam||' ('||coalesce(benutting,0)::text||'%)', ', ' order by benutting)
        ||'. Samen '||round(sum(slack))::text||' uur onbenutte contractcapaciteit — zet ze in op open diensten.'),
      round(sum(slack),1),
      round(sum(slack) * (select gz from k)),
      jsonb_agg(jsonb_build_object('naam',naam,'benutting',benutting,'slack',slack) order by benutting)
    from loon_util2
    where benutting is not null and benutting < 60 and slack > 8
    having count(*) > 0

    union all
    -- D. BHV-/medicatie-dekkingsrisico per locatie (alleen locaties met vraag)
    select
      'skill|'||s.locatie||'|bhv|'||(select pk from k),
      'skill_gap',
      (case when s.bhv_cnt = 0 then 'hoog' when s.bhv_cnt = 1 then 'hoog' else 'midden' end),
      s.locatie,
      ('BHV-dekking op '||s.locatie),
      ('Slechts '||s.bhv_cnt::text||' van '||s.team_cnt::text||' medewerker(s) in het voorkeurteam van '||s.locatie
        ||' heeft BHV-certificering. Enkelvoudig uitvalrisico — plan extra BHV-training in.'),
      0::numeric,
      0::numeric,
      jsonb_build_object('bhv_cnt',s.bhv_cnt,'med_cnt',s.med_cnt,'team_cnt',s.team_cnt)
    from skills s
    join loc_dg ld on lower(ld.locatie) = lower(s.locatie)
    where s.team_cnt >= 3 and s.bhv_cnt <= 2

    union all
    -- E. Forecast: beschikkingen die binnenkort aflopen (vraag daalt)
    select
      'forecast|org|aflopend|'||(select pk from k),
      'forecast',
      'laag',
      null::text,
      'Beschikkingen lopen binnenkort af',
      ((select aflopend from besch)::text||' beschikking(en) lopen af binnen 60 dagen'
        ||case when (select startend from besch) > 0 then ' en '||(select startend from besch)::text||' nieuwe beschikking(en) starten' else '' end
        ||'. Controleer of de personeelsbehoefte moet worden bijgesteld.'),
      0::numeric,
      0::numeric,
      jsonb_build_object('aflopend',(select aflopend from besch),'startend',(select startend from besch))
    where (select aflopend from besch) > 0 or (select startend from besch) > 0
  )
  select f.sleutel, f.type, f.prioriteit, f.locatie, f.titel, f.onderbouwing,
         f.impact_uren, f.impact_eur, f.data,
         coalesce(d.status,'open') as status, d.besloten_door_naam, d.besloten_op, d.notitie
  from findings f
  left join public.workforce_aanbeveling_beslissingen d on d.sleutel = f.sleutel
  where public._taken_kijk_niveau(auth.uid()) <= 3
  order by case f.prioriteit when 'hoog' then 0 when 'midden' then 1 else 2 end,
           f.impact_eur desc nulls last, f.titel;
$function$;
grant execute on function public.workforce_aanbevelingen(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Skills & dekking per locatie (voorkeurteam)
-- ---------------------------------------------------------------------
create or replace function public.workforce_skills_dekking()
returns table(
  locatie text, team_aantal int, loondienst_aantal int, zzp_aantal int,
  kernteam_aantal int, bhv_aantal int, medicatie_aantal int, risico text
)
language sql stable security definer set search_path to 'public'
as $function$
  with geldig as (select lower(trim(l.naam)) as ln from public.locaties l where coalesce(l.archived,false) = false)
  select loc.locatie,
         count(*)::int as team_aantal,
         count(*) filter (where m.dienstverband = 'Loondienst')::int as loondienst_aantal,
         count(*) filter (where m.dienstverband = 'Inhuur')::int as zzp_aantal,
         count(*) filter (where lower(coalesce(m.data->>'kernteam','')) = lower(loc.locatie))::int as kernteam_aantal,
         count(*) filter (where lower(coalesce(m.data->>'trainingBhv','')) = 'true')::int as bhv_aantal,
         count(*) filter (where lower(coalesce(m.data->>'trainingMedicatie','')) = 'true')::int as medicatie_aantal,
         case
           when count(*) filter (where lower(coalesce(m.data->>'trainingBhv','')) = 'true') = 0 then 'rood'
           when count(*) filter (where lower(coalesce(m.data->>'trainingBhv','')) = 'true') <= 1 then 'oranje'
           else 'groen'
         end as risico
  from public.medewerkers m
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(m.data->'locatiesSelected') = 'array' then m.data->'locatiesSelected' else '[]'::jsonb end
  ) as loc(locatie)
  where coalesce(m.archived,false) = false
    and lower(trim(loc.locatie)) in (select ln from geldig)
    and public._taken_kijk_niveau(auth.uid()) <= 3
  group by loc.locatie
  order by team_aantal desc, loc.locatie;
$function$;
grant execute on function public.workforce_skills_dekking() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Forecast: vraag vs open per locatie per week (komende N weken)
-- ---------------------------------------------------------------------
create or replace function public.workforce_forecast(p_weken int default 6)
returns table(
  locatie text, week_start date, vraag_uren numeric, open_uren numeric,
  dekkingsgraad numeric, status text
)
language sql stable security definer set search_path to 'public'
as $function$
  with weken as (
    select (date_trunc('week',(now() at time zone 'Europe/Amsterdam'))::date + (g * 7)) as wk_start
    from generate_series(0, greatest(1, least(coalesce(p_weken,6), 16)) - 1) g
  ),
  geldig as (select lower(trim(l.naam)) as ln from public.locaties l where coalesce(l.archived,false) = false),
  d as (
    select coalesce(nullif(trim(pl.locatie),''),'(onbekend)') as locatie,
           (date_trunc('week', pl.start_iso)::date) as wk,
           greatest(0, extract(epoch from (pl.einde_iso - pl.start_iso))/3600.0 - coalesce(pl.pauze_uren,0)) as uren,
           (coalesce(trim(pl.teamlid),'') = '') as is_open
    from public.planning pl
    where coalesce(pl.archived,false) = false
      and pl.einde_iso is not null and pl.start_iso is not null
      and lower(trim(pl.locatie)) in (select ln from geldig)
  )
  select d.locatie, w.wk_start,
         round(sum(d.uren),1) as vraag_uren,
         round(sum(d.uren) filter (where d.is_open),1) as open_uren,
         case when sum(d.uren) > 0 then round((sum(d.uren) - sum(d.uren) filter (where d.is_open))/sum(d.uren)*100,1) else null end as dekkingsgraad,
         case
           when sum(d.uren) <= 0 then 'onbekend'
           when (sum(d.uren) - sum(d.uren) filter (where d.is_open))/sum(d.uren) >= 0.90 then 'groen'
           when (sum(d.uren) - sum(d.uren) filter (where d.is_open))/sum(d.uren) >= 0.70 then 'oranje'
           else 'rood'
         end as status
  from weken w
  join d on d.wk = w.wk_start
  where public._taken_kijk_niveau(auth.uid()) <= 3
  group by d.locatie, w.wk_start
  order by d.locatie, w.wk_start;
$function$;
grant execute on function public.workforce_forecast(int) to authenticated;

-- ---------------------------------------------------------------------
-- 7. KPI-RPC (strategisch directie-dashboard)
-- ---------------------------------------------------------------------
create or replace function public.workforce_kpis(
  p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_ps date := coalesce(p_start, date_trunc('month',(now() at time zone 'Europe/Amsterdam'))::date);
  v_pe date := coalesce(p_end, (date_trunc('month',(now() at time zone 'Europe/Amsterdam')) + interval '1 month - 1 day')::date);
  v_gz numeric;
  v_vraag numeric; v_open numeric; v_gevuld numeric;
  v_open_diensten int; v_loc_rood int;
  v_onbenut numeric; v_benut numeric;
  v_hoog int; v_aflopend int;
begin
  if public._taken_kijk_niveau(auth.uid()) > 3 then
    return jsonb_build_object('niveau_te_laag', true);
  end if;

  select coalesce(round(avg(nullif(m.data->>'uurAlgemeen','')::numeric),2),45) into v_gz
  from public.medewerkers m where m.dienstverband = 'Inhuur' and coalesce(m.archived,false) = false;

  select coalesce(sum(vraag_uren),0), coalesce(sum(open_uren),0), coalesce(sum(gevuld_uren),0),
         coalesce(sum(open_diensten),0), count(*) filter (where status = 'rood')
    into v_vraag, v_open, v_gevuld, v_open_diensten, v_loc_rood
  from public.workforce_capaciteit(v_ps, v_pe);

  -- onbenutte loondienst-uren + gemiddelde benutting in de periode
  with span as (select (v_pe - v_ps + 1)::numeric / 7.0 as weken),
  u as (
    select nullif(m.data->>'contracturen','')::numeric * (select weken from span) as cap,
           coalesce((
             select sum(greatest(0, extract(epoch from (pl.einde_iso - pl.start_iso))/3600.0 - coalesce(pl.pauze_uren,0)))
             from public.planning pl
             where coalesce(pl.archived,false) = false and pl.einde_iso is not null
               and pl.start_iso >= v_ps and pl.start_iso < v_pe + 1
               and lower(trim(pl.teamlid)) = lower(trim(coalesce(m.voornaam,'')||' '||coalesce(m.achternaam,'')))
           ),0) as gepland
    from public.medewerkers m
    where m.dienstverband = 'Loondienst' and coalesce(m.archived,false) = false
      and nullif(m.data->>'contracturen','')::numeric > 0
  )
  select coalesce(sum(greatest(0, cap - gepland)),0), round(avg(case when cap > 0 then gepland/cap*100 else null end),1)
    into v_onbenut, v_benut from u;

  select count(*) filter (where prioriteit = 'hoog') into v_hoog
  from public.workforce_aanbevelingen(v_ps, v_pe);

  select count(*) into v_aflopend
  from public.beschikkingen b
  where coalesce(b.gearchiveerd,false) = false and b.eind_iso between current_date and current_date + 60;

  return jsonb_build_object(
    'vraag_uren',        round(coalesce(v_vraag,0),1),
    'gevuld_uren',       round(coalesce(v_gevuld,0),1),
    'open_uren',         round(coalesce(v_open,0),1),
    'open_diensten',     coalesce(v_open_diensten,0),
    'dekkingsgraad',     case when v_vraag > 0 then round(v_gevuld / v_vraag * 100, 1) else null end,
    'inhuur_impact_eur', round(coalesce(v_open,0) * coalesce(v_gz,45)),
    'loondienst_onbenut_uren', round(coalesce(v_onbenut,0),1),
    'loondienst_benutting',    v_benut,
    'locaties_rood',     coalesce(v_loc_rood,0),
    'aanbevelingen_hoog', coalesce(v_hoog,0),
    'aflopende_beschikkingen', coalesce(v_aflopend,0)
  );
end;
$function$;
grant execute on function public.workforce_kpis(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Beslis over een AI-aanbeveling (opvolgen/afwijzen). Management (niveau <=3).
--    Legt beslisser + notitie vast en meldt de directie/eigenaar (niveau <= 2).
-- ---------------------------------------------------------------------
create or replace function public.workforce_aanbeveling_beslis(
  p_sleutel text, p_periode text, p_type text, p_locatie text, p_titel text,
  p_status text, p_notitie text default null,
  p_impact_uren numeric default null, p_impact_eur numeric default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_naam text := public._productie_naam(auth.uid());
  v_id uuid;
begin
  if public._taken_kijk_niveau(v_uid) > 3 then
    raise exception 'Geen rechten om een advies te beoordelen (alleen management).';
  end if;
  if p_status not in ('open','opgepakt','afgewezen') then
    raise exception 'Ongeldige status: %', p_status;
  end if;

  insert into public.workforce_aanbeveling_beslissingen
    (sleutel, periode_key, type, locatie, titel, status, impact_uren, impact_eur, notitie,
     besloten_door, besloten_door_naam, besloten_op)
  values (p_sleutel, p_periode, p_type, p_locatie, p_titel, p_status, p_impact_uren, p_impact_eur, p_notitie,
     case when p_status <> 'open' then v_uid end,
     case when p_status <> 'open' then v_naam end,
     case when p_status <> 'open' then now() end)
  on conflict (sleutel) do update set
    status = p_status,
    periode_key = coalesce(p_periode, public.workforce_aanbeveling_beslissingen.periode_key),
    type = coalesce(p_type, public.workforce_aanbeveling_beslissingen.type),
    locatie = coalesce(p_locatie, public.workforce_aanbeveling_beslissingen.locatie),
    titel = coalesce(p_titel, public.workforce_aanbeveling_beslissingen.titel),
    notitie = coalesce(p_notitie, public.workforce_aanbeveling_beslissingen.notitie),
    impact_uren = coalesce(p_impact_uren, public.workforce_aanbeveling_beslissingen.impact_uren),
    impact_eur = coalesce(p_impact_eur, public.workforce_aanbeveling_beslissingen.impact_eur),
    besloten_door = case when p_status <> 'open' then v_uid else public.workforce_aanbeveling_beslissingen.besloten_door end,
    besloten_door_naam = case when p_status <> 'open' then v_naam else public.workforce_aanbeveling_beslissingen.besloten_door_naam end,
    besloten_op = case when p_status <> 'open' then now() else public.workforce_aanbeveling_beslissingen.besloten_op end,
    laatst_gewijzigd = now()
  returning id into v_id;

  if p_status <> 'open' then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select pr.id, 'workforce_aanbeveling',
           'Workforce-advies ' || p_status || ': ' || coalesce(p_titel,'personeelsadvies'),
           coalesce(v_naam,'Iemand') || ' heeft het personeelsplanning-advies '''
             || coalesce(p_titel,'advies') || ''''
             || coalesce(' (' || p_locatie || ')','') || ' als ''' || p_status || ''' gemarkeerd.',
           'workforce', p_sleutel
    from public.profiles pr
    where public._taken_kijk_niveau(pr.id) <= 2
      and pr.id is distinct from v_uid;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_status);
end;
$function$;
grant execute on function public.workforce_aanbeveling_beslis(text, text, text, text, text, text, text, numeric, numeric) to authenticated;
