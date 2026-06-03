-- Financiën › Locaties — winst/verlies per locatie per maand.
-- Toegepast via Supabase MCP (apply_migration). Dit bestand legt de definities vast
-- voor de repo-historie.
--
-- Toegang: STRIKT alleen rol Eigenaar of Directeur (NIET admin-tier) — server-side
-- afgeschermd via can_view_financien(). Frontend gate: permissions-page-map.js
-- (strict:true) + permissions-gate.js / permissions-nav-hide.js.
--
-- Kosten   = ingehuurde ZZP-diensten uit planning: netto-uren × uurtarief
--            (medewerkers.data.uurAlgemeen, fallback 45). Loondienst heeft geen
--            uurtarief in de data en zit dus niet in de kosten.
-- Opbrengst = beschikkingen-omzet per locatie: betaald + gedeclareerd-open +
--            nog-te-declareren-schatting (gem. maand-factuur per beschikking,
--            identiek aan beschikkingen_dashboard_v2), gekoppeld via
--            facturen -> bs2_disposition_payments -> beschikkingen.locatie.
-- Venster   = vanaf eerste maand met kosten-data t/m huidige maand.

-- Strikte rol-gate: alleen Eigenaar of Directeur.
create or replace function public.can_view_financien()
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in ('eigenaar','directeur')
  );
$$;

-- Hoofd-dashboard: totalen + per locatie + maandreeks.
create or replace function public.financien_locaties_dashboard(p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security invoker
set search_path to 'public'
as $$
declare
  v_result jsonb;
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
  fb as (
    select bp.disposition_id as bid, (substr(f.periode,7,4)||'-'||substr(f.periode,4,2)) as ym, f.status, f.bedrag, coalesce(lmx.naam,'Overig') as loc
    from facturen f join bs2_disposition_payments bp on bp.id = f.id join beschikkingen b on b.id = bp.disposition_id
    left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'') where not f.gearchiveerd and f.periode ~ '^\d{2}-\d{2}-\d{4}'
  ),
  fmonth_loc as (
    select ym, loc, coalesce(sum(bedrag) filter (where status='betaald'),0) as paid, coalesce(sum(bedrag) filter (where status<>'betaald'),0) as pending,
           count(*) filter (where status='betaald') as paid_cnt, count(*) filter (where status<>'betaald') as pending_cnt
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
    select m.ym, ba.loc, sum(case when bl.bid is null then ba.gem_maand else 0 end) as amount, count(*) filter (where bl.bid is null) as cnt
    from besch_act ba join months_f m on m.ym >= ba.eerste_ym and m.ym >= to_char(ba.start_iso,'YYYY-MM') and m.ym <= to_char(least(coalesce(ba.eind_iso,current_date),current_date),'YYYY-MM')
    left join billed bl on bl.bid = ba.id and bl.ym = m.ym group by m.ym, ba.loc
  ),
  rev as (
    select coalesce(fm.ym, td.ym) as ym, coalesce(fm.loc, td.loc) as loc, coalesce(fm.paid,0) as paid, coalesce(fm.pending,0) as pending, coalesce(td.amount,0) as to_declare
    from fmonth_loc fm full outer join todecl td on td.ym = fm.ym and td.loc = fm.loc
  ),
  pl as (
    select coalesce(r.ym, z.ym) as ym, coalesce(r.loc, z.loc) as loc,
           coalesce(r.paid,0)+coalesce(r.pending,0)+coalesce(r.to_declare,0) as omzet,
           coalesce(r.paid,0) as paid, coalesce(r.pending,0) as pending, coalesce(r.to_declare,0) as to_declare,
           coalesce(z.kosten,0) as kosten, coalesce(z.uren,0) as uren, coalesce(z.diensten,0) as diensten
    from rev r full outer join zzp_m z on z.ym = r.ym and z.loc = r.loc
  ),
  win as ( select coalesce((select min_ym from cost_win), to_char(current_date,'YYYY-MM')) as min_ym, to_char(current_date,'YYYY-MM') as max_ym ),
  defm as ( select least(greatest(coalesce((select max_ym from win_f), (select max_ym from win)), (select min_ym from win)), (select max_ym from win)) as d ),
  refp as (
    select coalesce(to_char(p_start,'YYYY-MM'), (select d from defm)) as s_ym,
           coalesce(to_char(p_end,'YYYY-MM'),   (select d from defm)) as e_ym
  ),
  zzpers_sel as ( select loc, count(distinct teamlid_key) as zzpers from zzp, refp where zzp.ym >= refp.s_ym and zzp.ym <= refp.e_ym group by loc ),
  loc_sel as (
    select pl.loc, sum(omzet) as omzet, sum(paid) as paid, sum(pending) as pending, sum(to_declare) as to_declare, sum(kosten) as kosten, sum(uren) as uren, sum(diensten) as diensten
    from pl, refp where pl.ym >= refp.s_ym and pl.ym <= refp.e_ym group by pl.loc
  )
  select jsonb_build_object(
    'period', (select jsonb_build_object('start', s_ym, 'end', e_ym) from refp),
    'window', (select jsonb_build_object('min', min_ym, 'max', max_ym) from win),
    'totals', (
      select jsonb_build_object(
        'omzet', round(coalesce(sum(omzet),0)::numeric,2), 'paid', round(coalesce(sum(paid),0)::numeric,2),
        'pending', round(coalesce(sum(pending),0)::numeric,2), 'to_declare', round(coalesce(sum(to_declare),0)::numeric,2),
        'kosten', round(coalesce(sum(kosten),0)::numeric,2), 'resultaat', round((coalesce(sum(omzet),0)-coalesce(sum(kosten),0))::numeric,2),
        'uren', round(coalesce(sum(uren),0)::numeric,1), 'diensten', coalesce(sum(diensten),0),
        'zzpers', (select count(distinct teamlid_key) from zzp, refp r where zzp.ym>=r.s_ym and zzp.ym<=r.e_ym),
        'locaties', (select count(*) from loc_sel where omzet<>0 or kosten<>0)
      ) from loc_sel),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', ls.loc, 'kleur', coalesce(lc.kleur, '#94a3b8'),
        'omzet', round(ls.omzet::numeric,2), 'paid', round(ls.paid::numeric,2), 'pending', round(ls.pending::numeric,2), 'to_declare', round(ls.to_declare::numeric,2),
        'kosten', round(ls.kosten::numeric,2), 'resultaat', round((ls.omzet-ls.kosten)::numeric,2),
        'uren', round(ls.uren::numeric,1), 'diensten', ls.diensten, 'zzpers', coalesce(zs.zzpers,0),
        'marge_pct', case when ls.omzet>0 then round(((ls.omzet-ls.kosten)/ls.omzet*100)::numeric,1) else null end
      ) order by ls.omzet desc, ls.kosten desc)
      from loc_sel ls left join loc_color lc on lc.naam = ls.loc left join zzpers_sel zs on zs.loc = ls.loc
      where ls.omzet<>0 or ls.kosten<>0
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('ym', ym, 'omzet', round(omzet::numeric,2), 'kosten', round(kosten::numeric,2), 'resultaat', round((omzet-kosten)::numeric,2)) order by ym)
      from ( select pl.ym, sum(omzet) as omzet, sum(kosten) as kosten from pl, win where pl.ym >= win.min_ym and pl.ym <= win.max_ym group by pl.ym ) mm
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Drill-down per locatie: ZZP'ers + cliënten/beschikkingen.
create or replace function public.financien_locatie_maand_detail(p_location text, p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security invoker
set search_path to 'public'
as $$
declare
  v_result jsonb;
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
  bloc as ( select b.id, coalesce(lmx.naam,'Overig') as loc from beschikkingen b left join lm lmx on lmx.naam = nullif(btrim(b.locatie),'') )
  select jsonb_build_object(
    'location', p_location,
    'period', (select jsonb_build_object('start', s_ym, 'end', e_ym) from refp),
    'zzpers', coalesce((
      select jsonb_agg(jsonb_build_object('naam', naam, 'uren', round(uren::numeric,1), 'tarief', round(tarief::numeric,2), 'kosten', round(kosten::numeric,2)) order by kosten desc)
      from (
        select coalesce(nullif(z.naam,''),'(open dienst)') as naam, sum(z.net_uren) as uren, sum(z.net_uren*z.tarief) as kosten, max(z.tarief) as tarief
        from zzp z, refp where z.loc = p_location and z.ym >= refp.s_ym and z.ym <= refp.e_ym group by 1
      ) q), '[]'::jsonb),
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
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('ym', ym, 'omzet', round(omzet::numeric,2), 'kosten', round(kosten::numeric,2), 'resultaat', round((omzet-kosten)::numeric,2)) order by ym)
      from (
        select mm.ym,
               coalesce((select sum(rb.paid+rb.pending+rb.to_declare) from rev_b rb join bloc on bloc.id=rb.bid where bloc.loc=p_location and rb.ym=mm.ym),0) as omzet,
               coalesce((select kosten from zzp_m z where z.loc=p_location and z.ym=mm.ym),0) as kosten
        from (select win.min_ym, win.max_ym from win) w
        cross join lateral generate_series(to_date(w.min_ym,'YYYY-MM'), to_date(w.max_ym,'YYYY-MM'), interval '1 month') gs
        cross join lateral (select to_char(gs,'YYYY-MM') as ym) mm
      ) z where omzet<>0 or kosten<>0
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
