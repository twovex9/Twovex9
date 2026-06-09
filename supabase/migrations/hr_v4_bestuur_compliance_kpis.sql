-- ============================================================================
-- HR Module v4 — G53/G54 (compliance SKJ/beleid/score) + G50/G51 (bestuurs-KPI's)
-- ============================================================================
-- 1) hr_compliance_overzicht: + skj_geldig (geldige SKJ-registratie-doc).
-- 2) hr_compliance_kpis: + skj_geldig_aantal, beleid_pct, compliance_score (G53/G54).
-- 3) hr_bestuur_kpis(): ZZP%, personeelskosten (indicatief), verloop, compliance-score
--    voor het management-dashboard (G50/G51/G54), can_view_management-gated.
--
-- Compliance-score = transparante gewogen samenstelling:
--   30% VOG-geldig · 20% onboarding afgerond · 25% contract getekend · 25% beleid.
--
-- Eerlijkheid bij dunne data: personeelskosten + verloop tonen expliciet hoeveel
-- dossiers compleet zijn; de UI labelt ze "indicatief". SKJ wordt als absoluut
-- aantal getoond (geen misleidend % zonder duidelijke noemer/registratie-bron).
-- Idempotent. SKJ-detectie = education-doc met 'skj' in de naam, nog geldig.
-- ============================================================================

-- Drop in afhankelijkheidsvolgorde (kpis roept overzicht aan).
drop function if exists public.hr_compliance_kpis();
drop function if exists public.hr_compliance_overzicht();

create or replace function public.hr_compliance_overzicht()
 returns table(
   medewerker_id text,
   naam text,
   dienstverband text,
   vog_aanwezig boolean,
   vog_geldig boolean,
   vog_vervaldatum date,
   verlopen_docs integer,
   binnenkort_docs integer,
   onboarding_afgerond boolean,
   contract_getekend boolean,
   skj_geldig boolean
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select
    m.id::text as medewerker_id,
    coalesce(
      nullif(trim(coalesce(m.data->>'voornaam','') || ' ' || coalesce(m.data->>'achternaam','')), ''),
      m.data->>'naam', m.email, m.id::text
    ) as naam,
    coalesce(m.data->>'dienstverband','') as dienstverband,
    exists(select 1 from public.medewerker_documenten d
           where d.medewerker_id = m.id::text and coalesce(d.archived,false)=false and d.type='vog') as vog_aanwezig,
    exists(select 1 from public.medewerker_documenten d
           where d.medewerker_id = m.id::text and coalesce(d.archived,false)=false and d.type='vog'
             and (d.vervaldatum_date is null or d.vervaldatum_date >= (now() at time zone 'Europe/Amsterdam')::date)) as vog_geldig,
    (select max(d.vervaldatum_date) from public.medewerker_documenten d
           where d.medewerker_id = m.id::text and coalesce(d.archived,false)=false and d.type='vog') as vog_vervaldatum,
    (select count(*)::int from public.medewerker_documenten d
           where d.medewerker_id = m.id::text and coalesce(d.archived,false)=false
             and d.vervaldatum_date is not null and d.vervaldatum_date < (now() at time zone 'Europe/Amsterdam')::date) as verlopen_docs,
    (select count(*)::int from public.medewerker_documenten d
           where d.medewerker_id = m.id::text and coalesce(d.archived,false)=false
             and d.vervaldatum_date is not null
             and d.vervaldatum_date >= (now() at time zone 'Europe/Amsterdam')::date
             and d.vervaldatum_date <= (now() at time zone 'Europe/Amsterdam')::date + 90) as binnenkort_docs,
    exists(select 1 from public.onboarding_trajecten ot
           where ot.medewerker_id = m.id and ot.afgerond_op is not null) as onboarding_afgerond,
    exists(select 1 from public.contracten c
           where c.medewerker_id = m.id and coalesce(c.archived,false)=false
             and lower(coalesce(c.status,'')) in ('getekend','ondertekend','signed','afgerond','actief','voltooid')) as contract_getekend,
    exists(select 1 from public.medewerker_documenten d
           where d.medewerker_id = m.id::text and coalesce(d.archived,false)=false
             and (d.type='education' or d.type is null) and coalesce(d.naam,'') ~* 'skj'
             and (d.vervaldatum_date is null or d.vervaldatum_date >= (now() at time zone 'Europe/Amsterdam')::date)) as skj_geldig
  from public.medewerkers m
  where coalesce(m.archived,false)=false
    and public.is_office_staff()
  order by naam;
$function$;

create or replace function public.hr_compliance_kpis()
 returns table(
   totaal integer,
   loondienst integer,
   zzp integer,
   zzp_pct numeric,
   vog_geldig_pct numeric,
   vog_aanwezig_pct numeric,
   onboarding_afgerond_pct numeric,
   contract_getekend_pct numeric,
   verlopen_docs_totaal integer,
   binnenkort_docs_totaal integer,
   medewerkers_met_verlopen integer,
   skj_geldig_aantal integer,
   beleid_pct numeric,
   compliance_score numeric
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with o as (select * from public.hr_compliance_overzicht()),
  agg as (
    select
      count(*)::int as totaal,
      count(*) filter (where lower(dienstverband)='loondienst')::int as loondienst,
      count(*) filter (where lower(dienstverband)='inhuur')::int as zzp,
      round(100.0 * count(*) filter (where lower(dienstverband)='inhuur') / nullif(count(*),0), 1) as zzp_pct,
      round(100.0 * count(*) filter (where vog_geldig) / nullif(count(*),0), 1) as vog_geldig_pct,
      round(100.0 * count(*) filter (where vog_aanwezig) / nullif(count(*),0), 1) as vog_aanwezig_pct,
      round(100.0 * count(*) filter (where onboarding_afgerond) / nullif(count(*),0), 1) as onboarding_afgerond_pct,
      round(100.0 * count(*) filter (where contract_getekend) / nullif(count(*),0), 1) as contract_getekend_pct,
      coalesce(sum(verlopen_docs),0)::int as verlopen_docs_totaal,
      coalesce(sum(binnenkort_docs),0)::int as binnenkort_docs_totaal,
      count(*) filter (where verlopen_docs > 0)::int as medewerkers_met_verlopen,
      count(*) filter (where skj_geldig)::int as skj_geldig_aantal
    from o
  )
  select
    agg.totaal, agg.loondienst, agg.zzp, agg.zzp_pct,
    agg.vog_geldig_pct, agg.vog_aanwezig_pct, agg.onboarding_afgerond_pct, agg.contract_getekend_pct,
    agg.verlopen_docs_totaal, agg.binnenkort_docs_totaal, agg.medewerkers_met_verlopen,
    agg.skj_geldig_aantal,
    coalesce(public.hr_beleid_kennisname_pct(9), 0) as beleid_pct,
    round(
      0.30 * coalesce(agg.vog_geldig_pct,0)
    + 0.20 * coalesce(agg.onboarding_afgerond_pct,0)
    + 0.25 * coalesce(agg.contract_getekend_pct,0)
    + 0.25 * coalesce(public.hr_beleid_kennisname_pct(9),0)
    ) as compliance_score
  from agg;
$function$;

-- ----------------------------------------------------------------------------
-- hr_bestuur_kpis() — bestuurs-KPI's voor het management-dashboard (G50/G51/G54).
-- can_view_management-gated (Eigenaar/Directeur). Eerlijk bij dunne data:
-- personeelskosten = som van ingevulde maandsalarissen (× werkgeverslasten 1,30)
-- + ZZP-maandkosten, met telling hoeveel dossiers compleet zijn.
-- Verloop = medewerkers met fase 'Uit dienst' t.o.v. het totaal.
-- ----------------------------------------------------------------------------
create or replace function public.hr_bestuur_kpis()
 returns table(
   actief integer,
   zzp integer,
   zzp_pct numeric,
   personeelskosten_maand_indicatief numeric,
   salaris_dossiers_compleet integer,
   salaris_dossiers_totaal integer,
   uit_dienst_aantal integer,
   verloop_pct numeric,
   compliance_score numeric
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_actief int; v_zzp int; v_uit int; v_totaal_ooit int;
  v_loon_kosten numeric; v_loon_n int;
  v_zzp_kosten numeric; v_zzp_n int;
  v_score numeric;
begin
  if not public.can_view_management() then
    return query select 0,0,0::numeric,0::numeric,0,0,0,0::numeric,0::numeric;
    return;
  end if;

  select count(*) filter (where coalesce(archived,false)=false),
         count(*) filter (where coalesce(archived,false)=false and data->>'dienstverband'='Inhuur'),
         count(*) filter (where lower(coalesce(fase,''))='uit dienst'),
         count(*)
    into v_actief, v_zzp, v_uit, v_totaal_ooit
    from public.medewerkers;

  -- Loondienst: maandsalaris (bruto) × werkgeverslasten 1,30. Alleen ingevulde, >0.
  select coalesce(sum(sal * 1.30), 0), count(*)
    into v_loon_kosten, v_loon_n
    from (
      select nullif(regexp_replace(replace(replace(coalesce(data->>'salaris',''),'€',''),' ',''), '[^0-9.]','','g'),'')::numeric as sal
      from public.medewerkers
      where coalesce(archived,false)=false and coalesce(data->>'dienstverband','')='Loondienst'
        and coalesce(data->>'salaris','') ~ '[1-9]'
    ) s
    where sal is not null and sal > 0;

  -- ZZP: maandkosten uit zzpKostenMaand (ingevuld, >0).
  select coalesce(sum(k), 0), count(*)
    into v_zzp_kosten, v_zzp_n
    from (
      select nullif(regexp_replace(replace(replace(coalesce(data->>'zzpKostenMaand',''),'€',''),' ',''), '[^0-9.]','','g'),'')::numeric as k
      from public.medewerkers
      where coalesce(archived,false)=false and coalesce(data->>'dienstverband','')='Inhuur'
        and coalesce(data->>'zzpKostenMaand','') ~ '[1-9]'
    ) z
    where k is not null and k > 0;

  -- Compliance-score uit de gedeelde compliance-KPI's (zelfde formule als compliance-dashboard).
  -- Kolom kwalificeren (k.) — anders ambigu met de gelijknamige OUT-kolom.
  select k.compliance_score into v_score from public.hr_compliance_kpis() k;

  return query select
    coalesce(v_actief,0),
    coalesce(v_zzp,0),
    round(100.0 * coalesce(v_zzp,0) / nullif(v_actief,0), 1),
    round(coalesce(v_loon_kosten,0) + coalesce(v_zzp_kosten,0)),
    coalesce(v_loon_n,0) + coalesce(v_zzp_n,0),
    coalesce(v_actief,0),
    coalesce(v_uit,0),
    round(100.0 * coalesce(v_uit,0) / nullif(v_totaal_ooit,0), 1),
    coalesce(v_score,0);
end;
$function$;

select 'hr_v4_bestuur_compliance_kpis OK' as result;
