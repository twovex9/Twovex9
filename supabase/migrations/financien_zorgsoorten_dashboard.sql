-- Financiën › Zorgsoorten — kosten/opbrengst/resultaat per zorgsoort op basis van de PLANNING.
--
-- Per zorgsoort (1 op 1, Ambulant intern, Ambulant extern, WLZ, …):
--   • Uren     = som netto-uren van planning-diensten met die zorgsoort in de periode.
--   • Opbrengst= hoeveelheid (uren/dagen/weken volgens tarieftype) × zorgsoort.tarief.
--   • Kosten   = wat de ingezette medewerker ons kost:
--                - ZZP/inhuur  → medewerker.data.uurAlgemeen × uren (fallback 45).
--                - Loondienst  → geschat uurtarief uit bruto maandsalaris:
--                                salaris × (1 + werkgeverslasten) / (contracturen × weken/maand) × uren.
--                                (werkgeverslasten 30%, 4,33 weken/maand — gelijk aan de Overhead-tab.)
--                - Open dienst (geen/onbekende medewerker) → zorgsoort.kosten_tarief × uren (of 0).
--   • Resultaat= opbrengst − kosten, marge% = resultaat / opbrengst.
--
-- Zorgsoort van een dienst = planning.data->>'zorgsoort' (nieuwe diensten), met afleiding voor
-- bestaande diensten (diensttype "<naam> 1 op 1" → "1 op 1", ambulant/wlz uit type of locatie).
--
-- Read-only. SECURITY DEFINER + can_view_financien()-gate zodat het overzicht betrouwbaar werkt
-- voor Eigenaar/Directeur/Finance ongeacht hun row-level toegang tot planning/medewerkers.

-- ───────────────────────────────────────────────────────────────────────────
-- Veilige getal-parser (NL/EN-notatie → numeric of NULL; nooit een cast-error).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.besa_parse_num(p text)
returns numeric language sql immutable parallel safe
as $$
  select case
    when p is null then null
    when regexp_replace(replace(p, ',', '.'), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
      then regexp_replace(replace(p, ',', '.'), '[^0-9.]', '', 'g')::numeric
    else null
  end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Hoofd-dashboard: totals + per zorgsoort + maandreeks.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.financien_zorgsoorten_dashboard(p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
  c_wgl   constant numeric := 0.30;   -- werkgeverslasten loondienst
  c_weken constant numeric := 4.33;   -- weken per maand
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;

  with
  named as ( select unnest(array['1 op 1','Ambulant intern','Ambulant extern','WLZ']) as naam ),
  -- Planning-diensten met een (expliciete of afgeleide) zorgsoort.
  zp as (
    select
      p.id,
      to_char(p.start_iso,'YYYY-MM') as ym,
      greatest(0, extract(epoch from (p.einde_iso - p.start_iso))/3600.0 - coalesce(p.pauze_uren,0)) as net_uren,
      lower(btrim(p.teamlid)) as teamlid_key,
      nullif(btrim(p.client),'') as client,
      coalesce(
        nullif(btrim(p.data->>'zorgsoort'),''),
        case
          when p.diensttype ~* '1\s*op\s*1' or p.diensttype ~* 'een op een' then '1 op 1'
          when p.diensttype ~* 'ambulant.*intern' or p.locatie ~* 'ambulant.*intern' then 'Ambulant intern'
          when p.diensttype ~* 'ambulant.*extern' or p.locatie ~* 'ambulant.*extern' then 'Ambulant extern'
          when p.diensttype ~* 'wlz' or p.locatie ~* 'wlz' then 'WLZ'
          else null
        end
      ) as zorgsoort
    from planning p
    where p.start_iso is not null and p.einde_iso is not null and coalesce(p.archived,false)=false
  ),
  -- Kosten + medewerker-soort per dienst.
  zc as (
    select
      zp.id, zp.ym, zp.net_uren, zp.client, lower(btrim(zp.zorgsoort)) as zs_key, zp.zorgsoort as zs_naam,
      case when m.id is null then null
           when (lower(coalesce(m.data->>'bs2_employment_type',''))='hiring'
                 or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%'
                 or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%') then 'zzp'
           else 'loondienst' end as mw_soort,
      case
        when m.id is null then null
        when (lower(coalesce(m.data->>'bs2_employment_type',''))='hiring'
              or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%'
              or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%')
          then coalesce(public.besa_parse_num(m.data->>'uurAlgemeen'), 45)
        else
          case when coalesce(public.besa_parse_num(m.data->>'salaris'),0) > 0
                    and coalesce(public.besa_parse_num(m.data->>'contracturen'),0) > 0
               then (public.besa_parse_num(m.data->>'salaris') * (1 + c_wgl))
                    / (public.besa_parse_num(m.data->>'contracturen') * c_weken)
               else null end
      end as uurkosten
    from zp
    left join medewerkers m
      on lower(btrim(m.voornaam||' '||m.achternaam)) = zp.teamlid_key
     and coalesce(m.archived,false) = false
    where zp.zorgsoort is not null
  ),
  -- Koppel tarief/eenheid van de zorgsoort; bereken opbrengst + kosten per dienst.
  zd as (
    select
      zc.*,
      z.naam as canon_naam, z.tarieftype as eenheid, z.tarief, z.kosten_tarief,
      (zc.net_uren / case z.tarieftype when 'dag' then 24.0 when 'week' then 168.0 else 1 end) as hoeveelheid,
      (zc.net_uren / case z.tarieftype when 'dag' then 24.0 when 'week' then 168.0 else 1 end) * coalesce(z.tarief,0) as omzet,
      zc.net_uren * coalesce(zc.uurkosten, z.kosten_tarief, 0) as kosten
    from zc
    join zorgsoorten z on lower(btrim(z.naam)) = zc.zs_key and not z.archived
  ),
  -- Venster (alle maanden met zorgsoort-data) + default-periode = huidige maand geklemd in venster.
  win as (
    select coalesce(min(ym), to_char(current_date,'YYYY-MM')) as min_ym,
           greatest(coalesce(max(ym), to_char(current_date,'YYYY-MM')), to_char(current_date,'YYYY-MM')) as max_ym
    from zd
  ),
  defm as (
    select least(greatest(to_char(current_date,'YYYY-MM'), (select min_ym from win)), (select max_ym from win)) as d
  ),
  refp as (
    select coalesce(to_char(p_start,'YYYY-MM'), (select d from defm)) as s_ym,
           coalesce(to_char(p_end,'YYYY-MM'),   (select d from defm)) as e_ym
  ),
  -- Universe = de 4 vaste zorgsoorten + elke zorgsoort met planning-data in het venster.
  uni as (
    select z.id, z.naam, z.tarieftype as eenheid, z.tarief, z.kosten_tarief
    from zorgsoorten z
    where not z.archived and (
      lower(btrim(z.naam)) in (select lower(btrim(naam)) from named)
      or exists (select 1 from zd where zd.zs_key = lower(btrim(z.naam)))
    )
  ),
  -- Aggregatie per zorgsoort binnen de gekozen periode.
  agg as (
    select zd.zs_key,
           sum(zd.net_uren) as uren, count(*) as diensten,
           sum(zd.hoeveelheid) as hoeveelheid, sum(zd.omzet) as omzet, sum(zd.kosten) as kosten,
           sum(case when zd.mw_soort='zzp'        then zd.kosten else 0 end) as kosten_zzp,
           sum(case when zd.mw_soort='loondienst' then zd.kosten else 0 end) as kosten_loondienst,
           sum(case when zd.mw_soort is null       then zd.kosten else 0 end) as kosten_open,
           sum(case when zd.mw_soort='zzp'        then zd.net_uren else 0 end) as uren_zzp,
           sum(case when zd.mw_soort='loondienst' then zd.net_uren else 0 end) as uren_loondienst,
           sum(case when zd.mw_soort is null       then zd.net_uren else 0 end) as uren_open,
           count(distinct zd.client) filter (where zd.client is not null) as clienten
    from zd, refp
    where zd.ym >= refp.s_ym and zd.ym <= refp.e_ym
    group by zd.zs_key
  ),
  -- Maandreeks (binnen venster) voor de grafiek.
  months as (
    select zd.ym,
           round(sum(zd.omzet)::numeric,2) as omzet,
           round(sum(zd.kosten)::numeric,2) as kosten,
           round((sum(zd.omzet)-sum(zd.kosten))::numeric,2) as resultaat
    from zd group by zd.ym order by zd.ym
  )
  select jsonb_build_object(
    'period', (select jsonb_build_object('start', s_ym, 'end', e_ym) from refp),
    'window', (select jsonb_build_object('min', min_ym, 'max', max_ym) from win),
    'totals', (
      select jsonb_build_object(
        'omzet',  round(coalesce(sum(a.omzet),0)::numeric,2),
        'kosten', round(coalesce(sum(a.kosten),0)::numeric,2),
        'kosten_zzp',        round(coalesce(sum(a.kosten_zzp),0)::numeric,2),
        'kosten_loondienst', round(coalesce(sum(a.kosten_loondienst),0)::numeric,2),
        'kosten_open',       round(coalesce(sum(a.kosten_open),0)::numeric,2),
        'resultaat', round((coalesce(sum(a.omzet),0)-coalesce(sum(a.kosten),0))::numeric,2),
        'uren', round(coalesce(sum(a.uren),0)::numeric,2),
        'diensten', coalesce(sum(a.diensten),0),
        'zorgsoorten', (select count(*) from uni),
        'marge_pct', case when coalesce(sum(a.omzet),0) > 0
                          then round(((coalesce(sum(a.omzet),0)-coalesce(sum(a.kosten),0))/sum(a.omzet)*100)::numeric,1) else null end
      ) from agg a
    ),
    'zorgsoorten', (
      select coalesce(jsonb_agg(row order by row->>'naam'), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', u.id, 'naam', u.naam, 'eenheid', u.eenheid,
          'tarief', u.tarief, 'kosten_tarief', u.kosten_tarief,
          'uren', round(coalesce(a.uren,0)::numeric,2),
          'diensten', coalesce(a.diensten,0),
          'clienten', coalesce(a.clienten,0),
          'hoeveelheid', round(coalesce(a.hoeveelheid,0)::numeric,2),
          'omzet', round(coalesce(a.omzet,0)::numeric,2),
          'kosten', round(coalesce(a.kosten,0)::numeric,2),
          'kosten_zzp', round(coalesce(a.kosten_zzp,0)::numeric,2),
          'kosten_loondienst', round(coalesce(a.kosten_loondienst,0)::numeric,2),
          'kosten_open', round(coalesce(a.kosten_open,0)::numeric,2),
          'uren_zzp', round(coalesce(a.uren_zzp,0)::numeric,2),
          'uren_loondienst', round(coalesce(a.uren_loondienst,0)::numeric,2),
          'uren_open', round(coalesce(a.uren_open,0)::numeric,2),
          'resultaat', round((coalesce(a.omzet,0)-coalesce(a.kosten,0))::numeric,2),
          'marge_pct', case when coalesce(a.omzet,0) > 0
                            then round(((coalesce(a.omzet,0)-coalesce(a.kosten,0))/a.omzet*100)::numeric,1) else null end
        ) as row
        from uni u left join agg a on a.zs_key = lower(btrim(u.naam))
      ) s
    ),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('ym',ym,'omzet',omzet,'kosten',kosten,'resultaat',resultaat)), '[]'::jsonb) from months)
  ) into v_result;

  return coalesce(v_result, jsonb_build_object('totals', jsonb_build_object(), 'zorgsoorten', '[]'::jsonb, 'months', '[]'::jsonb));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Drill-down per zorgsoort: cliënten + medewerkers + maandreeks binnen de periode.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.financien_zorgsoort_detail(p_zorgsoort text, p_start date default null, p_end date default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
  c_wgl   constant numeric := 0.30;
  c_weken constant numeric := 4.33;
  v_key   text := lower(btrim(coalesce(p_zorgsoort,'')));
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;

  with
  zp as (
    select
      p.id, to_char(p.start_iso,'YYYY-MM') as ym,
      greatest(0, extract(epoch from (p.einde_iso - p.start_iso))/3600.0 - coalesce(p.pauze_uren,0)) as net_uren,
      lower(btrim(p.teamlid)) as teamlid_key, nullif(btrim(p.teamlid),'') as teamlid, nullif(btrim(p.client),'') as client,
      coalesce(
        nullif(btrim(p.data->>'zorgsoort'),''),
        case
          when p.diensttype ~* '1\s*op\s*1' or p.diensttype ~* 'een op een' then '1 op 1'
          when p.diensttype ~* 'ambulant.*intern' or p.locatie ~* 'ambulant.*intern' then 'Ambulant intern'
          when p.diensttype ~* 'ambulant.*extern' or p.locatie ~* 'ambulant.*extern' then 'Ambulant extern'
          when p.diensttype ~* 'wlz' or p.locatie ~* 'wlz' then 'WLZ'
          else null
        end
      ) as zorgsoort
    from planning p
    where p.start_iso is not null and p.einde_iso is not null and coalesce(p.archived,false)=false
  ),
  refp as (
    select coalesce(to_char(p_start,'YYYY-MM'), to_char(current_date,'YYYY-MM')) as s_ym,
           coalesce(to_char(p_end,'YYYY-MM'),   to_char(current_date,'YYYY-MM')) as e_ym
  ),
  z as ( select naam, tarieftype, tarief, kosten_tarief from zorgsoorten where lower(btrim(naam)) = v_key and not archived limit 1 ),
  zc as (
    select
      zp.id, zp.ym, zp.net_uren, zp.client, zp.teamlid,
      case when m.id is null then 'open'
           when (lower(coalesce(m.data->>'bs2_employment_type',''))='hiring'
                 or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%'
                 or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%') then 'zzp'
           else 'loondienst' end as mw_soort,
      case
        when m.id is null then null
        when (lower(coalesce(m.data->>'bs2_employment_type',''))='hiring'
              or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%'
              or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%')
          then coalesce(public.besa_parse_num(m.data->>'uurAlgemeen'), 45)
        else case when coalesce(public.besa_parse_num(m.data->>'salaris'),0) > 0
                       and coalesce(public.besa_parse_num(m.data->>'contracturen'),0) > 0
                  then (public.besa_parse_num(m.data->>'salaris') * (1 + c_wgl))
                       / (public.besa_parse_num(m.data->>'contracturen') * c_weken)
                  else null end
      end as uurkosten
    from zp, refp
    left join medewerkers m on lower(btrim(m.voornaam||' '||m.achternaam)) = zp.teamlid_key and coalesce(m.archived,false)=false
    where lower(btrim(zp.zorgsoort)) = v_key and zp.ym >= refp.s_ym and zp.ym <= refp.e_ym
  ),
  zd as (
    select zc.*,
      (zc.net_uren / case (select tarieftype from z) when 'dag' then 24.0 when 'week' then 168.0 else 1 end) * coalesce((select tarief from z),0) as omzet,
      zc.net_uren * coalesce(zc.uurkosten, (select kosten_tarief from z), 0) as kosten
    from zc
  )
  select jsonb_build_object(
    'zorgsoort', v_key,
    'naam', (select naam from z),
    'eenheid', (select tarieftype from z),
    'tarief', (select tarief from z),
    'kosten_tarief', (select kosten_tarief from z),
    'period', (select jsonb_build_object('start', s_ym, 'end', e_ym) from refp),
    'totals', jsonb_build_object(
      'uren', round(coalesce((select sum(net_uren) from zd),0)::numeric,2),
      'diensten', coalesce((select count(*) from zd),0),
      'omzet', round(coalesce((select sum(omzet) from zd),0)::numeric,2),
      'kosten', round(coalesce((select sum(kosten) from zd),0)::numeric,2),
      'resultaat', round(coalesce((select sum(omzet)-sum(kosten) from zd),0)::numeric,2)
    ),
    'clienten', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'client', client, 'uren', round(uren::numeric,2), 'diensten', diensten,
        'omzet', round(omzet::numeric,2), 'kosten', round(kosten::numeric,2),
        'resultaat', round((omzet-kosten)::numeric,2)
      ) order by omzet desc nulls last), '[]'::jsonb)
      from (
        select coalesce(client,'— (open dienst)') as client, sum(net_uren) uren, count(*) diensten, sum(omzet) omzet, sum(kosten) kosten
        from zd group by coalesce(client,'— (open dienst)')
      ) c
    ),
    'medewerkers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'teamlid', teamlid, 'soort', mw_soort, 'uren', round(uren::numeric,2), 'diensten', diensten,
        'uurkosten', round(uurkosten::numeric,2), 'kosten', round(kosten::numeric,2)
      ) order by kosten desc nulls last), '[]'::jsonb)
      from (
        select coalesce(teamlid,'— (open dienst)') as teamlid, mw_soort, max(uurkosten) uurkosten,
               sum(net_uren) uren, count(*) diensten, sum(kosten) kosten
        from zd group by coalesce(teamlid,'— (open dienst)'), mw_soort
      ) mw
    ),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object('ym',ym,'omzet',round(omzet::numeric,2),'kosten',round(kosten::numeric,2),'resultaat',round((omzet-kosten)::numeric,2)) order by ym), '[]'::jsonb)
      from (select ym, sum(omzet) omzet, sum(kosten) kosten from zd group by ym) mm
    )
  ) into v_result;

  return coalesce(v_result, jsonb_build_object('totals', jsonb_build_object()));
end;
$$;

grant execute on function public.financien_zorgsoorten_dashboard(date,date) to anon, authenticated;
grant execute on function public.financien_zorgsoort_detail(text,date,date) to anon, authenticated;
grant execute on function public.besa_parse_num(text) to anon, authenticated;
