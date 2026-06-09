-- ============================================================================
-- HR Module v4 — G49: compliance-aggregatie-RPC's voor het Compliance-dashboard
-- ============================================================================
-- hr_compliance_overzicht(): per actieve medewerker compliance-status (VOG, docs,
--   onboarding, contract).  hr_compliance_kpis(): geaggregeerde KPI-percentages.
-- Beide SECURITY DEFINER + office-only gate. Steunen op vervaldatum_date (Fase 0).
-- Idempotent.
-- ============================================================================

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
   contract_getekend boolean
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
             and lower(coalesce(c.status,'')) in ('getekend','ondertekend','signed','afgerond','actief','voltooid')) as contract_getekend
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
   medewerkers_met_verlopen integer
 )
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with o as (select * from public.hr_compliance_overzicht())
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
    count(*) filter (where verlopen_docs > 0)::int as medewerkers_met_verlopen
  from o;
$function$;

select 'hr_v4_compliance_rpc OK' as result;
