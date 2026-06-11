-- Dashboard per locatie v1 — uitbreiding voor het eigenaar/management-dashboard.
-- Bouwt voort op financien_locaties_dashboard.sql. Drie wijzigingen, idempotent:
--
--  1. financien_locaties_dashboard  → voegt AUTOMATISCHE loondienst-kosten per locatie
--     toe (data->>'salaris' × 1,30 werkgeverslasten, gesplitst over de medewerker zijn
--     data->'locatiesSelected'; dezelfde salaris-parse als hr_bestuur_kpis) + het aantal
--     openstaande (toekomstige) diensten per locatie. Loondienst telt mee in 'kosten'.
--  2. financien_locatie_maand_detail → drill-down toont de loondienst-medewerkers per
--     locatie met hun gealloceerde maandkost + de openstaande diensten van die locatie.
--  3. planning_open_diensten_per_locatie → nieuwe RPC: per locatie het aantal + de lijst
--     openstaande toekomstige diensten (datum, tijd, functie/diensttype, afgeleide urgentie
--     o.b.v. dagen-tot-start). Gegate op can_view_financien() OF can_view_management().
--
-- Koppelingen (consistent met de rest van het systeem):
--   Medewerker → locatie : medewerkers.data->'locatiesSelected' (master-locatienaam)
--   ZZP'er     → locatie : planning.locatie (ingezette dienst)
--   Cliënt     → locatie : clienten.locatie
--   Declaratie → cliënt → locatie : facturen → bs2_disposition_payments → beschikkingen.locatie
--   Dienst     → locatie : planning.locatie
--   Kosten     → medewerker/ZZP'er → locatie : loondienst via locatiesSelected, ZZP via planning

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. HOOFD-DASHBOARD (met loondienst-kosten + open diensten per locatie)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.financien_locaties_dashboard(p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security invoker
set search_path to 'public'
as $$
declare
  v_result jsonb;
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;

  with
  lm as ( select distinct naam from locaties where not archived and naam is not null and naam <> '' ),
  loc_color as ( select naam, min(kleur) as kleur from locaties where not archived and naam is not null and naam <> '' group by naam ),
  zzp as (
    select to_char(p.start_iso,'YYYY-MM') as ym, coalesce(lmx.naam,'Overig') as loc,
           greatest(0, extract(epoch from (p.einde_iso - p.start_iso))/3600.0 - coalesce(p.pauze_uren,0)) as net_uren,
           coalesce(nullif(m.data->>'uurAlgemeen','')::numeric, 45) as tarief, lower(btrim(p.teamlid)) as teamlid_key
    from planning p
    join medewerkers m on lower(btrim(m.voornaam||' '||m.achternaam)) = lower(btrim(p.teamlid))
     and (lower(coalesce(m.data->>'bs2_employment_type','')) = 'hiring' or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%' or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%')
    left join lm lmx on lmx.naam = nullif(btrim(p.locatie),'')
    where p.start_iso is not null and p.einde_iso is not null and coalesce(p.archived,false)=false
  ),
  zzp_m as ( select ym, loc, sum(net_uren*tarief) as kosten, sum(net_uren) as uren, count(*) as diensten from zzp group by ym, loc ),
  cost_win as ( select min(ym) as min_ym from zzp_m ),
  -- Loondienst-medewerkers: maandkost = bruto-salaris × 1,30 (werkgeverslasten), gesplitst
  -- gelijk over de gekoppelde locaties (data->'locatiesSelected'). Identieke salaris-parse
  -- als hr_bestuur_kpis. Onbekende/leeg-locatie → 'Overig'.
  loon_base as (
    select m.id,
           (nullif(regexp_replace(replace(replace(coalesce(m.data->>'salaris',''),'€',''),' ',''), '[^0-9.]','','g'),'')::numeric) * 1.30 as maandkost,
           coalesce(m.data->'locatiesSelected','[]'::jsonb) as sel
    from medewerkers m
    where coalesce(m.archived,false)=false
      and coalesce(m.data->>'dienstverband','')='Loondienst'
      and coalesce(m.data->>'salaris','') ~ '[1-9]'
  ),
  loon_alloc as (
    select lb.id,
           coalesce(nullif(btrim(locname),''),'Overig') as loc_raw,
           lb.maandkost / nullif(jsonb_array_length(lb.sel),0) as maand_per_loc
    from loon_base lb
    cross join lateral jsonb_array_elements_text(lb.sel) as locname
    where lb.maandkost is not null and lb.maandkost > 0 and jsonb_array_length(lb.sel) > 0
  ),
  loon_loc as (
    select case when lmx.naam is not null then lmx.naam else 'Overig' end as loc, la.maand_per_loc
    from loon_alloc la left join lm lmx on lmx.naam = la.loc_raw
  ),
  -- Open (toekomstige, niet-toegewezen) diensten per locatie — operationeel, niet periode-gebonden.
  opendienst as (
    select coalesce(lmx.naam,'Overig') as loc,
           count(*) as open_diensten,
           count(*) filter (where (p.start_iso at time zone 'UTC')::date <= v_today + 7) as open_week
    from planning p
    left join lm lmx on lmx.naam = nullif(btrim(p.locatie),'')
    where coalesce(p.archived,false)=false
      and (p.teamlid is null or btrim(p.teamlid)='')
      and p.start_iso is not null
      and (p.start_iso at time zone 'UTC')::date >= v_today
    group by 1
  ),
  fb as (
    select bp.disposition_id as bid, (substr(f.periode,7,4)||'-'||substr(f.periode,4,2)) as ym, f.status, f.bedrag, coalesce(lmx.naam,'Overig') as loc
    from facturen f join bs2_disposition_payments bp on bp.id = f.id join beschikkingen b on b.id = bp.disposition_id
    left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'') where not f.gearchiveerd and f.periode ~ '^\d{2}-\d{2}-\d{4}'
  ),
  fmonth_loc as (
    select ym, loc, coalesce(sum(bedrag) filter (where status='betaald'),0) as paid, coalesce(sum(bedrag) filter (where status<>'betaald'),0) as pending
    from fb group by ym, loc
  ),
  bmnd as ( select bid, ym, sum(bedrag) as msom from fb group by bid, ym ),
  bstat as ( select bid, min(ym) as eerste_ym, round(avg(msom)::numeric,2) as gem_maand from bmnd group by bid ),
  billed as ( select distinct bid, ym from fb ),
  win_f as ( select min(ym) as min_ym, max(ym) as max_ym from fb ),
  months_f as (
    select to_char(gs,'YYYY-MM') as ym from win_f
    cross join lateral generate_series(to_date(win_f.min_ym,'YYYY-MM'), greatest(to_date(win_f.max_ym,'YYYY-MM'), date_trunc('month',current_date)::date), interval '1 month') gs
    where win_f.min_ym is not null
  ),
  besch_act as (
    select b.id, b.start_iso, b.eind_iso, s.eerste_ym, s.gem_maand, coalesce(lmx.naam,'Overig') as loc
    from beschikkingen b join bstat s on s.bid = b.id left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'')
    where not b.gearchiveerd and b.fase <> 'In aanvraag'
  ),
  todecl as (
    select m.ym, ba.loc, sum(case when bl.bid is null then ba.gem_maand else 0 end) as amount
    from besch_act ba join months_f m on m.ym >= ba.eerste_ym and m.ym >= to_char(ba.start_iso,'YYYY-MM') and m.ym <= to_char(least(coalesce(ba.eind_iso,current_date),current_date),'YYYY-MM')
    left join billed bl on bl.bid = ba.id and bl.ym = m.ym group by m.ym, ba.loc
  ),
  rev as (
    select coalesce(fm.ym, td.ym) as ym, coalesce(fm.loc, td.loc) as loc, coalesce(fm.paid,0) as paid, coalesce(fm.pending,0) as pending, coalesce(td.amount,0) as to_declare
    from fmonth_loc fm full outer join todecl td on td.ym = fm.ym and td.loc = fm.loc
  ),
  win as ( select coalesce((select min_ym from cost_win), to_char(current_date,'YYYY-MM')) as min_ym, to_char(current_date,'YYYY-MM') as max_ym ),
  win_months as (
    select to_char(gs,'YYYY-MM') as ym from win
    cross join lateral generate_series(to_date(win.min_ym,'YYYY-MM'), to_date(win.max_ym,'YYYY-MM'), interval '1 month') gs
  ),
  onk_m as (
    select o.locatie as loc, wm.ym, sum(o.bedrag) as onkosten
    from financien_locatie_onkosten o join win_months wm on wm.ym >= o.van_ym and wm.ym <= coalesce(o.tot_ym, wm.ym)
    where not o.archived
    group by o.locatie, wm.ym
  ),
  pers_m as (
    select p.locatie as loc, wm.ym, sum(p.maandkost) as personeel
    from financien_overhead_personeel p join win_months wm on wm.ym >= p.van_ym and wm.ym <= coalesce(p.tot_ym, wm.ym)
    where not p.archived
    group by p.locatie, wm.ym
  ),
  -- Loondienst is een doorlopende maandkost → toegewezen aan elke maand in het venster.
  loon_m as (
    select ll.loc, wm.ym, sum(ll.maand_per_loc) as loondienst
    from loon_loc ll cross join win_months wm
    group by ll.loc, wm.ym
  ),
  keys as ( select loc, ym from rev union select loc, ym from zzp_m union select loc, ym from onk_m union select loc, ym from pers_m union select loc, ym from loon_m ),
  pl as (
    select k.ym, k.loc,
           coalesce(r.paid,0)+coalesce(r.pending,0)+coalesce(r.to_declare,0) as omzet,
           coalesce(r.paid,0) as paid, coalesce(r.pending,0) as pending, coalesce(r.to_declare,0) as to_declare,
           coalesce(z.kosten,0) as kosten_zzp, coalesce(z.uren,0) as uren, coalesce(z.diensten,0) as diensten,
           coalesce(o.onkosten,0) as onkosten, coalesce(pr.personeel,0) as personeel, coalesce(lo.loondienst,0) as loondienst
    from keys k
    left join rev r on r.loc=k.loc and r.ym=k.ym
    left join zzp_m z on z.loc=k.loc and z.ym=k.ym
    left join onk_m o on o.loc=k.loc and o.ym=k.ym
    left join pers_m pr on pr.loc=k.loc and pr.ym=k.ym
    left join loon_m lo on lo.loc=k.loc and lo.ym=k.ym
  ),
  defm as ( select least(greatest(coalesce((select max_ym from win_f), (select max_ym from win)), (select min_ym from win)), (select max_ym from win)) as d ),
  refp as (
    select coalesce(to_char(p_start,'YYYY-MM'), (select d from defm)) as s_ym,
           coalesce(to_char(p_end,'YYYY-MM'),   (select d from defm)) as e_ym
  ),
  zzpers_sel as ( select loc, count(distinct teamlid_key) as zzpers from zzp, refp where zzp.ym >= refp.s_ym and zzp.ym <= refp.e_ym group by loc ),
  loc_sel as (
    select pl.loc, sum(omzet) as omzet, sum(paid) as paid, sum(pending) as pending, sum(to_declare) as to_declare,
           sum(kosten_zzp) as kosten_zzp, sum(onkosten) as onkosten, sum(personeel) as personeel, sum(loondienst) as loondienst,
           sum(kosten_zzp+onkosten+personeel+loondienst) as kosten,
           sum(uren) as uren, sum(diensten) as diensten
    from pl, refp where pl.ym >= refp.s_ym and pl.ym <= refp.e_ym group by pl.loc
  ),
  loc_kamers as (
    select naam as loc, max(coalesce(aantal_kamers,0)) as kamers
    from locaties where not archived and naam is not null and naam <> '' group by naam
  ),
  bezetting as (
    select lmx.naam as loc, count(*) as bezet
    from clienten c join lm lmx on lmx.naam = nullif(btrim(c.locatie),'')
    where not c.archived and lower(btrim(coalesce(c.fase,''))) = 'in zorg'
    group by lmx.naam
  ),
  loc_uni as (
    select loc from loc_sel where omzet <> 0 or kosten <> 0
    union select loc from loc_kamers where kamers > 0
    union select loc from bezetting where bezet > 0
    union select loc from opendienst where open_diensten > 0
  )
  select jsonb_build_object(
    'period', (select jsonb_build_object('start', s_ym, 'end', e_ym) from refp),
    'window', (select jsonb_build_object('min', min_ym, 'max', max_ym) from win),
    'totals', (
      select jsonb_build_object(
        'omzet', round(coalesce(sum(omzet),0)::numeric,2), 'paid', round(coalesce(sum(paid),0)::numeric,2),
        'pending', round(coalesce(sum(pending),0)::numeric,2), 'to_declare', round(coalesce(sum(to_declare),0)::numeric,2),
        'kosten_zzp', round(coalesce(sum(kosten_zzp),0)::numeric,2), 'onkosten', round(coalesce(sum(onkosten),0)::numeric,2),
        'personeel', round(coalesce(sum(personeel),0)::numeric,2), 'loondienst', round(coalesce(sum(loondienst),0)::numeric,2),
        'kosten', round(coalesce(sum(kosten),0)::numeric,2), 'resultaat', round((coalesce(sum(omzet),0)-coalesce(sum(kosten),0))::numeric,2),
        'uren', round(coalesce(sum(uren),0)::numeric,1), 'diensten', coalesce(sum(diensten),0),
        'zzpers', (select count(distinct teamlid_key) from zzp, refp r where zzp.ym>=r.s_ym and zzp.ym<=r.e_ym),
        'locaties', (select count(*) from loc_sel where omzet<>0 or kosten<>0),
        'open_diensten', (select coalesce(sum(open_diensten),0) from opendienst),
        'open_diensten_week', (select coalesce(sum(open_week),0) from opendienst),
        'kamers', (select coalesce(sum(kamers),0) from loc_kamers),
        'bezet', (select coalesce(sum(bezet),0) from bezetting),
        'vrij', (select coalesce(sum(greatest(coalesce(lk.kamers,0)-coalesce(bz.bezet,0),0)),0)
                 from loc_kamers lk left join bezetting bz on bz.loc = lk.loc where lk.kamers > 0),
        'zonder_locatie', (select count(*) from clienten c
                           where not c.archived and lower(btrim(coalesce(c.fase,''))) = 'in zorg'
                             and not exists (select 1 from lm where lm.naam = nullif(btrim(c.locatie),'')))
      ) from loc_sel),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', u.loc, 'kleur', coalesce(lc.kleur, '#94a3b8'),
        'omzet', round(coalesce(ls.omzet,0)::numeric,2), 'paid', round(coalesce(ls.paid,0)::numeric,2),
        'pending', round(coalesce(ls.pending,0)::numeric,2), 'to_declare', round(coalesce(ls.to_declare,0)::numeric,2),
        'kosten_zzp', round(coalesce(ls.kosten_zzp,0)::numeric,2), 'onkosten', round(coalesce(ls.onkosten,0)::numeric,2),
        'personeel', round(coalesce(ls.personeel,0)::numeric,2), 'loondienst', round(coalesce(ls.loondienst,0)::numeric,2),
        'kosten', round(coalesce(ls.kosten,0)::numeric,2),
        'resultaat', round((coalesce(ls.omzet,0)-coalesce(ls.kosten,0))::numeric,2),
        'uren', round(coalesce(ls.uren,0)::numeric,1), 'diensten', coalesce(ls.diensten,0), 'zzpers', coalesce(zs.zzpers,0),
        'marge_pct', case when coalesce(ls.omzet,0)>0 then round(((ls.omzet-ls.kosten)/ls.omzet*100)::numeric,1) else null end,
        'kamers', coalesce(lk.kamers,0), 'bezet', coalesce(bz.bezet,0),
        'vrij', greatest(coalesce(lk.kamers,0)-coalesce(bz.bezet,0),0),
        'open_diensten', coalesce(od.open_diensten,0), 'open_diensten_week', coalesce(od.open_week,0)
      ) order by coalesce(ls.omzet,0) desc, coalesce(ls.kosten,0) desc, u.loc)
      from loc_uni u
      left join loc_sel ls on ls.loc = u.loc
      left join loc_color lc on lc.naam = u.loc
      left join zzpers_sel zs on zs.loc = u.loc
      left join loc_kamers lk on lk.loc = u.loc
      left join bezetting bz on bz.loc = u.loc
      left join opendienst od on od.loc = u.loc
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('ym', ym, 'omzet', round(omzet::numeric,2), 'kosten', round(kosten::numeric,2), 'resultaat', round((omzet-kosten)::numeric,2)) order by ym)
      from ( select pl.ym, sum(omzet) as omzet, sum(kosten_zzp+onkosten+personeel+loondienst) as kosten from pl, win where pl.ym >= win.min_ym and pl.ym <= win.max_ym group by pl.ym ) mm
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DRILL-DOWN per locatie (+ loondienst-medewerkers + open diensten)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.financien_locatie_maand_detail(p_location text, p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security invoker
set search_path to 'public'
as $$
declare
  v_result jsonb;
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;

  with
  lm as ( select distinct naam from locaties where not archived and naam is not null and naam <> '' ),
  zzp as (
    select to_char(p.start_iso,'YYYY-MM') as ym, coalesce(lmx.naam,'Overig') as loc, btrim(p.teamlid) as naam,
           greatest(0, extract(epoch from (p.einde_iso - p.start_iso))/3600.0 - coalesce(p.pauze_uren,0)) as net_uren,
           coalesce(nullif(m.data->>'uurAlgemeen','')::numeric, 45) as tarief
    from planning p
    join medewerkers m on lower(btrim(m.voornaam||' '||m.achternaam)) = lower(btrim(p.teamlid))
     and (lower(coalesce(m.data->>'bs2_employment_type','')) = 'hiring' or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%' or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%')
    left join lm lmx on lmx.naam = nullif(btrim(p.locatie),'')
    where p.start_iso is not null and p.einde_iso is not null and coalesce(p.archived,false)=false
  ),
  zzp_m as ( select ym, loc, sum(net_uren*tarief) as kosten from zzp group by ym, loc ),
  cost_win as ( select min(ym) as min_ym from zzp_m ),
  fb as (
    select bp.disposition_id as bid, (substr(f.periode,7,4)||'-'||substr(f.periode,4,2)) as ym, f.status, f.bedrag, coalesce(lmx.naam,'Overig') as loc
    from facturen f join bs2_disposition_payments bp on bp.id = f.id join beschikkingen b on b.id = bp.disposition_id
    left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'') where not f.gearchiveerd and f.periode ~ '^\d{2}-\d{2}-\d{4}'
  ),
  fmonth_b as (
    select bid, ym, coalesce(sum(bedrag) filter (where status='betaald'),0) as paid, coalesce(sum(bedrag) filter (where status<>'betaald'),0) as pending
    from fb group by bid, ym
  ),
  bmnd as ( select bid, ym, sum(bedrag) as msom from fb group by bid, ym ),
  bstat as ( select bid, min(ym) as eerste_ym, round(avg(msom)::numeric,2) as gem_maand from bmnd group by bid ),
  billed as ( select distinct bid, ym from fb ),
  win_f as ( select min(ym) as min_ym, max(ym) as max_ym from fb ),
  months_f as (
    select to_char(gs,'YYYY-MM') as ym from win_f
    cross join lateral generate_series(to_date(win_f.min_ym,'YYYY-MM'), greatest(to_date(win_f.max_ym,'YYYY-MM'), date_trunc('month',current_date)::date), interval '1 month') gs
    where win_f.min_ym is not null
  ),
  besch_act as (
    select b.id, b.start_iso, b.eind_iso, s.eerste_ym, s.gem_maand, coalesce(lmx.naam,'Overig') as loc
    from beschikkingen b join bstat s on s.bid = b.id left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'')
    where not b.gearchiveerd and b.fase <> 'In aanvraag'
  ),
  todecl_b as (
    select ba.id as bid, m.ym, ba.gem_maand as to_declare
    from besch_act ba join months_f m on m.ym >= ba.eerste_ym and m.ym >= to_char(ba.start_iso,'YYYY-MM') and m.ym <= to_char(least(coalesce(ba.eind_iso,current_date),current_date),'YYYY-MM')
    left join billed bl on bl.bid = ba.id and bl.ym = m.ym where bl.bid is null
  ),
  rev_b as (
    select coalesce(fm.bid,td.bid) as bid, coalesce(fm.ym,td.ym) as ym, coalesce(fm.paid,0) as paid, coalesce(fm.pending,0) as pending, coalesce(td.to_declare,0) as to_declare
    from fmonth_b fm full outer join todecl_b td on td.bid=fm.bid and td.ym=fm.ym
  ),
  win as ( select coalesce((select min_ym from cost_win), to_char(current_date,'YYYY-MM')) as min_ym, to_char(current_date,'YYYY-MM') as max_ym ),
  defm as ( select least(greatest(coalesce((select max_ym from win_f), (select max_ym from win)), (select min_ym from win)), (select max_ym from win)) as d ),
  refp as (
    select coalesce(to_char(p_start,'YYYY-MM'), (select d from defm)) as s_ym,
           coalesce(to_char(p_end,'YYYY-MM'),   (select d from defm)) as e_ym
  ),
  period_months as (
    select to_char(gs,'YYYY-MM') as ym from refp
    cross join lateral generate_series(to_date(refp.s_ym,'YYYY-MM'), to_date(refp.e_ym,'YYYY-MM'), interval '1 month') gs
  ),
  bloc as ( select b.id, coalesce(lmx.naam,'Overig') as loc from beschikkingen b left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'') )
  select jsonb_build_object(
    'location', p_location,
    'period', (select jsonb_build_object('start', s_ym, 'end', e_ym) from refp),
    'kamers', (select max(coalesce(aantal_kamers,0)) from locaties where naam = p_location and not archived),
    'bezet', (
      select count(*) from clienten c
      where not c.archived and lower(btrim(coalesce(c.fase,''))) = 'in zorg'
        and case when p_location = 'Overig'
                 then not exists (select 1 from lm where lm.naam = nullif(btrim(c.locatie),''))
                 else nullif(btrim(c.locatie),'') = p_location end
    ),
    'jongeren', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'naam', trim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')),
               'clientnummer', c.clientnummer
             ) order by lower(trim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,''))))
      from clienten c
      where not c.archived and lower(btrim(coalesce(c.fase,''))) = 'in zorg'
        and case when p_location = 'Overig'
                 then not exists (select 1 from lm where lm.naam = nullif(btrim(c.locatie),''))
                 else nullif(btrim(c.locatie),'') = p_location end
    ), '[]'::jsonb),
    'zzpers', coalesce((
      select jsonb_agg(jsonb_build_object('naam', naam, 'uren', round(uren::numeric,1), 'tarief', round(tarief::numeric,2), 'kosten', round(kosten::numeric,2)) order by kosten desc)
      from (
        select coalesce(nullif(z.naam,''),'(open dienst)') as naam, sum(z.net_uren) as uren, sum(z.net_uren*z.tarief) as kosten, max(z.tarief) as tarief
        from zzp z, refp where z.loc = p_location and z.ym >= refp.s_ym and z.ym <= refp.e_ym group by 1
      ) q), '[]'::jsonb),
    -- Loondienst-medewerkers op deze locatie (maandkost gealloceerd × maanden in periode).
    'loondienst', coalesce((
      select jsonb_agg(jsonb_build_object(
               'naam', naam, 'functie', functie, 'maandkost', round(maand_per_loc::numeric,2),
               'maanden', mnd, 'kost_periode', round((maand_per_loc*mnd)::numeric,2)
             ) order by (maand_per_loc) desc, naam)
      from (
        select trim(coalesce(m.voornaam,'')||' '||coalesce(m.achternaam,'')) as naam,
               nullif(btrim(coalesce(m.data->>'functie', m.functie, '')),'') as functie,
               ((nullif(regexp_replace(replace(replace(coalesce(m.data->>'salaris',''),'€',''),' ',''), '[^0-9.]','','g'),'')::numeric) * 1.30)
                 / nullif(jsonb_array_length(coalesce(m.data->'locatiesSelected','[]'::jsonb)),0) as maand_per_loc,
               (select count(*) from period_months) as mnd
        from medewerkers m
        cross join lateral jsonb_array_elements_text(coalesce(m.data->'locatiesSelected','[]'::jsonb)) as locname
        left join lm lmx on lmx.naam = nullif(btrim(locname),'')
        where coalesce(m.archived,false)=false
          and coalesce(m.data->>'dienstverband','')='Loondienst'
          and coalesce(m.data->>'salaris','') ~ '[1-9]'
          and coalesce(lmx.naam,'Overig') = p_location
      ) q where maand_per_loc is not null and maand_per_loc > 0 and mnd > 0
    ), '[]'::jsonb),
    -- Openstaande (toekomstige) diensten op deze locatie (max 60, oplopend op datum).
    'open_diensten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'datum', datum, 'start', start_t, 'eind', eind_t,
               'functie', functie, 'diensttype', diensttype, 'dagen', dagen,
               'urgentie', case when dagen <= 2 then 'hoog' when dagen <= 7 then 'midden' else 'laag' end
             ) order by datum, start_t)
      from (
        select p.id,
               (p.start_iso at time zone 'UTC')::date as datum,
               to_char(p.start_iso at time zone 'UTC','HH24:MI') as start_t,
               to_char(p.einde_iso at time zone 'UTC','HH24:MI') as eind_t,
               coalesce(nullif(btrim(p.functie),''), nullif(btrim(p.diensttype),''), 'Dienst') as functie,
               nullif(btrim(p.diensttype),'') as diensttype,
               ((p.start_iso at time zone 'UTC')::date - v_today) as dagen
        from planning p
        left join lm lmx on lmx.naam = nullif(btrim(p.locatie),'')
        where coalesce(p.archived,false)=false
          and (p.teamlid is null or btrim(p.teamlid)='')
          and p.start_iso is not null
          and (p.start_iso at time zone 'UTC')::date >= v_today
          and coalesce(lmx.naam,'Overig') = p_location
        order by p.start_iso
        limit 60
      ) q
    ), '[]'::jsonb),
    'open_diensten_totaal', (
      select count(*) from planning p
      left join lm lmx on lmx.naam = nullif(btrim(p.locatie),'')
      where coalesce(p.archived,false)=false and (p.teamlid is null or btrim(p.teamlid)='')
        and p.start_iso is not null and (p.start_iso at time zone 'UTC')::date >= v_today
        and coalesce(lmx.naam,'Overig') = p_location
    ),
    'clienten', coalesce((
      select jsonb_agg(jsonb_build_object(
        'client', cl, 'beschikking', bnaam, 'zorgsoort', zs, 'tarief_eur', t_eur, 'tarief_eenheid', t_eenh,
        'omzet', round((paid+pending+to_declare)::numeric,2), 'paid', round(paid::numeric,2), 'pending', round(pending::numeric,2), 'to_declare', round(to_declare::numeric,2)
      ) order by (paid+pending+to_declare) desc)
      from (
        select b.id,
               coalesce((select trim(c.voornaam||' '||c.achternaam) from clienten c where c.data->>'bs2_id'=b.client_id limit 1), b.naam, '—') as cl,
               b.naam as bnaam, coalesce(nullif(b.zorgsoort_key,''),'—') as zs, b.tarief_eur as t_eur, b.tarief_eenheid as t_eenh,
               sum(rb.paid) as paid, sum(rb.pending) as pending, sum(rb.to_declare) as to_declare
        from rev_b rb join bloc on bloc.id=rb.bid join beschikkingen b on b.id=rb.bid, refp
        where bloc.loc = p_location and rb.ym >= refp.s_ym and rb.ym <= refp.e_ym
        group by b.id, b.naam, b.zorgsoort_key, b.tarief_eur, b.tarief_eenheid, b.client_id
        having (sum(rb.paid)+sum(rb.pending)+sum(rb.to_declare)) <> 0
      ) q), '[]'::jsonb),
    'personeel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'naam', pr.naam, 'functie', pr.functie, 'dienstverband', pr.dienstverband,
        'bruto_maand', round(pr.bruto_maand::numeric,2), 'werkgeverslasten_pct', pr.werkgeverslasten_pct,
        'netto_maand', case when pr.netto_maand is null then null else round(pr.netto_maand::numeric,2) end,
        'zzp_maand', round(pr.zzp_maand::numeric,2), 'maandkost', round(pr.maandkost::numeric,2),
        'van_ym', pr.van_ym, 'tot_ym', pr.tot_ym, 'maanden', pr.maanden,
        'kost_periode', round((pr.maandkost*pr.maanden)::numeric,2)
      ) order by (pr.maandkost*pr.maanden) desc, pr.naam)
      from (
        select p.*, (select count(*) from period_months pm where pm.ym >= p.van_ym and pm.ym <= coalesce(p.tot_ym, pm.ym)) as maanden
        from financien_overhead_personeel p
        where not p.archived and p.locatie = p_location
      ) pr
      where pr.maanden > 0
    ), '[]'::jsonb),
    'onkosten', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', orr.id, 'categorie', orr.categorie, 'omschrijving', orr.omschrijving,
        'bedrag', round(orr.bedrag::numeric,2), 'van_ym', orr.van_ym, 'tot_ym', orr.tot_ym,
        'maanden', orr.maanden, 'bedrag_periode', round((orr.bedrag*orr.maanden)::numeric,2)
      ) order by (orr.bedrag*orr.maanden) desc, orr.categorie)
      from (
        select o.id, o.categorie, o.omschrijving, o.bedrag, o.van_ym, o.tot_ym,
               (select count(*) from period_months pm where pm.ym >= o.van_ym and pm.ym <= coalesce(o.tot_ym, pm.ym)) as maanden
        from financien_locatie_onkosten o
        where not o.archived and o.locatie = p_location
      ) orr
      where orr.maanden > 0
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('ym', ym, 'omzet', round(omzet::numeric,2), 'kosten', round(kosten::numeric,2), 'resultaat', round((omzet-kosten)::numeric,2)) order by ym)
      from (
        select mm.ym,
               coalesce((select sum(rb.paid+rb.pending+rb.to_declare) from rev_b rb join bloc on bloc.id=rb.bid where bloc.loc=p_location and rb.ym=mm.ym),0) as omzet,
               coalesce((select kosten from zzp_m z where z.loc=p_location and z.ym=mm.ym),0)
               + coalesce((select sum(o.bedrag) from financien_locatie_onkosten o where not o.archived and o.locatie=p_location and o.van_ym<=mm.ym and mm.ym<=coalesce(o.tot_ym,mm.ym)),0)
               + coalesce((select sum(pp.maandkost) from financien_overhead_personeel pp where not pp.archived and pp.locatie=p_location and pp.van_ym<=mm.ym and mm.ym<=coalesce(pp.tot_ym,mm.ym)),0)
               + coalesce((
                   select sum(((nullif(regexp_replace(replace(replace(coalesce(m.data->>'salaris',''),'€',''),' ',''), '[^0-9.]','','g'),'')::numeric) * 1.30)
                              / nullif(jsonb_array_length(coalesce(m.data->'locatiesSelected','[]'::jsonb)),0))
                   from medewerkers m
                   cross join lateral jsonb_array_elements_text(coalesce(m.data->'locatiesSelected','[]'::jsonb)) as locname
                   left join lm lmx on lmx.naam = nullif(btrim(locname),'')
                   where coalesce(m.archived,false)=false and coalesce(m.data->>'dienstverband','')='Loondienst'
                     and coalesce(m.data->>'salaris','') ~ '[1-9]' and coalesce(lmx.naam,'Overig')=p_location
                 ),0) as kosten
        from (select win.min_ym, win.max_ym from win) w
        cross join lateral generate_series(to_date(w.min_ym,'YYYY-MM'), to_date(w.max_ym,'YYYY-MM'), interval '1 month') gs
        cross join lateral (select to_char(gs,'YYYY-MM') as ym) mm
      ) z where omzet<>0 or kosten<>0
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NIEUW: open diensten per locatie (operationeel overzicht)
-- ─────────────────────────────────────────────────────────────────────────────
-- p_locatie : optioneel filter op één master-locatie ('Overig' = zonder locatie).
-- p_dagen   : horizon in dagen voor de detail-lijst (default 14; counts zijn altijd volledig).
create or replace function public.planning_open_diensten_per_locatie(p_locatie text default null, p_dagen int default 14)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v jsonb;
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_dagen int := greatest(1, coalesce(p_dagen, 14));
begin
  if not (public.can_view_financien() or public.can_view_management()) then
    return jsonb_build_object('unauthorized', true);
  end if;

  with
  lm as ( select distinct naam from locaties where not archived and naam is not null and naam <> '' ),
  od as (
    select p.id,
           coalesce(lmx.naam,'Overig') as loc,
           (p.start_iso at time zone 'UTC')::date as datum,
           to_char(p.start_iso at time zone 'UTC','HH24:MI') as start_t,
           to_char(p.einde_iso at time zone 'UTC','HH24:MI') as eind_t,
           coalesce(nullif(btrim(p.functie),''), nullif(btrim(p.diensttype),''), 'Dienst') as functie,
           nullif(btrim(p.diensttype),'') as diensttype,
           ((p.start_iso at time zone 'UTC')::date - v_today) as dagen
    from planning p
    left join lm lmx on lmx.naam = nullif(btrim(p.locatie),'')
    where coalesce(p.archived,false)=false
      and (p.teamlid is null or btrim(p.teamlid)='')
      and p.start_iso is not null
      and (p.start_iso at time zone 'UTC')::date >= v_today
      and (p_locatie is null or coalesce(lmx.naam,'Overig') = p_locatie)
  ),
  od2 as (
    select *, case when dagen <= 2 then 'hoog' when dagen <= 7 then 'midden' else 'laag' end as urgentie from od
  )
  select jsonb_build_object(
    'today', v_today,
    'horizon_dagen', v_dagen,
    'totaal', (select count(*) from od2),
    'per_locatie', coalesce((
      select jsonb_agg(jsonb_build_object(
               'loc', loc, 'aantal', n, 'week', wk, 'maand', mnd, 'hoog', h, 'midden', mi, 'laag', l
             ) order by wk desc, n desc)
      from (
        select loc, count(*) n,
               count(*) filter (where dagen <= 7) wk,
               count(*) filter (where dagen <= 30) mnd,
               count(*) filter (where urgentie='hoog') h,
               count(*) filter (where urgentie='midden') mi,
               count(*) filter (where urgentie='laag') l
        from od2 group by loc
      ) z
    ), '[]'::jsonb),
    'diensten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'loc', loc, 'datum', datum, 'start', start_t, 'eind', eind_t,
               'functie', functie, 'diensttype', diensttype, 'dagen', dagen, 'urgentie', urgentie
             ) order by datum, start_t)
      from ( select * from od2 where dagen <= v_dagen order by datum, start_t limit 300 ) q
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

select 'dashboard_per_locatie_v1 OK' as result;
