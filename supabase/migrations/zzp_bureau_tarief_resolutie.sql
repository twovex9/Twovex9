-- ============================================================================
-- Bureau-tarief automatisch hanteren in de ZZP-proforma (uurtarief + fee).
-- Eén canonieke tarief-resolutie; generator + herberekening gebruiken dezelfde.
-- Keuze Jason 2026-06-04: tarief = standaard_uurtarief + fee_per_uur; HR mag
-- per medewerker handmatig overschrijven (data.tariefHandmatig=true).
--
-- Eenmalige backfill na deploy (onaangeroerde klaargezette baseline):
--   select public.herbereken_zzp_proforma_baseline();
-- ============================================================================

-- 1) Canonieke tarief-resolutie voor één inhuur-medewerker.
create or replace function public.zzp_medewerker_uurtarief(p_med uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_bureau    text;
  v_handmatig boolean;
  v_uur       numeric;
  v_btar      numeric;
begin
  select nullif(btrim(m.data->>'bureau'),''),
         lower(coalesce(m.data->>'tariefHandmatig','')) = 'true',
         nullif(m.data->>'uurAlgemeen','')::numeric
    into v_bureau, v_handmatig, v_uur
  from public.medewerkers m
  where m.id = p_med;

  -- Bureau-medewerker zonder handmatige override → tarief van het bureau (uurtarief + fee).
  if v_bureau is not null and not coalesce(v_handmatig, false) then
    select coalesce(b.standaard_uurtarief, 0) + coalesce(b.fee_per_uur, 0)
      into v_btar
    from public.bureaus b
    where lower(btrim(b.naam)) = lower(v_bureau)
      and coalesce(b.archived, false) = false
    order by b.aanmaakdatum asc
    limit 1;
    if v_btar is not null and v_btar > 0 then
      return v_btar;
    end if;
  end if;

  -- Direct ZZP, handmatige override, of onbekend bureau → persoonlijk uurtarief, fallback 45.
  return coalesce(v_uur, 45);
end
$fn$;

comment on function public.zzp_medewerker_uurtarief(uuid) is
  'Canoniek uurtarief voor een inhuur-medewerker: bureau-tarief (standaard_uurtarief + fee_per_uur) tenzij data.tariefHandmatig=true of geen geldig bureau, dan data.uurAlgemeen (fallback 45).';

-- 2) Generator gebruikt nu de canonieke tarief-resolutie i.p.v. losse uurAlgemeen.
create or replace function public.genereer_zzp_proforma(p_jaar integer, p_maand integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare
  v_ym text := p_jaar::text || '-' || lpad(p_maand::text,2,'0');
  v_created int := 0;
  v_skipped int := 0;
  v_regels int := 0;
  r record;
  v_id uuid;
begin
  for r in
    select
      m.id as medewerker_id,
      max(btrim(m.voornaam||' '||m.achternaam)) as medewerker_naam,
      max(nullif(m.data->>'bs2_id','')) as bs2_id,
      max(nullif(m.data->>'bureau','')) as bureau,
      coalesce(nullif(btrim(p.locatie),''),'(geen locatie)') as locatie,
      max(public.zzp_medewerker_uurtarief(m.id)) as tarief,
      count(*) as diensten,
      round(sum(greatest(0, extract(epoch from (p.einde_iso - p.start_iso))/3600.0 - coalesce(p.pauze_uren,0)))::numeric, 2) as uren
    from public.planning p
    join public.medewerkers m
      on lower(btrim(m.voornaam||' '||m.achternaam)) = lower(btrim(p.teamlid))
     and (lower(coalesce(m.data->>'bs2_employment_type',''))='hiring'
          or lower(coalesce(m.data->>'dienstverband','')) like '%inhuur%'
          or lower(coalesce(m.data->>'dienstverband','')) like '%zzp%')
    where to_char(p.start_iso,'YYYY-MM') = v_ym
      and p.start_iso is not null and p.einde_iso is not null
      and coalesce(p.archived,false)=false
    group by m.id, coalesce(nullif(btrim(p.locatie),''),'(geen locatie)')
  loop
    if exists (select 1 from public.zzp_facturen f
               where f.medewerker_id = r.medewerker_id and f.locatie = r.locatie
                 and f.jaar = p_jaar and f.maand = p_maand) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.zzp_facturen
      (medewerker_id, medewerker_naam, bs2_id, bureau, locatie, jaar, maand,
       proforma_tarief, proforma_uren, proforma_bedrag, proforma_diensten,
       ingediend_uren, ingediend_bedrag, status)
    values
      (r.medewerker_id, r.medewerker_naam, r.bs2_id, r.bureau, r.locatie, p_jaar, p_maand,
       r.tarief, r.uren, round(r.uren * r.tarief, 2), r.diensten,
       r.uren, round(r.uren * r.tarief, 2), 'klaargezet')
    returning id into v_id;
    v_created := v_created + 1;

    insert into public.zzp_factuur_regels
      (factuur_id, planning_dienst_id, datum, dag, start_iso, einde_iso, pauze_uren,
       proforma_uren, proforma_tarief, proforma_bedrag, omschrijving,
       ingediend_uren, ingediend_tarief, ingediend_bedrag, sort_order)
    select
      v_id, p.id, p.start_iso::date,
      (case extract(dow from p.start_iso)::int
        when 0 then 'Zondag' when 1 then 'Maandag' when 2 then 'Dinsdag'
        when 3 then 'Woensdag' when 4 then 'Donderdag' when 5 then 'Vrijdag'
        when 6 then 'Zaterdag' end),
      p.start_iso, p.einde_iso, coalesce(p.pauze_uren,0),
      round(greatest(0, extract(epoch from (p.einde_iso-p.start_iso))/3600.0 - coalesce(p.pauze_uren,0))::numeric,2),
      r.tarief,
      round(greatest(0, extract(epoch from (p.einde_iso-p.start_iso))/3600.0 - coalesce(p.pauze_uren,0))::numeric * r.tarief,2),
      (case extract(dow from p.start_iso)::int
        when 0 then 'Zondag' when 1 then 'Maandag' when 2 then 'Dinsdag'
        when 3 then 'Woensdag' when 4 then 'Donderdag' when 5 then 'Vrijdag'
        when 6 then 'Zaterdag' end) || ' ' || to_char(p.start_iso,'DD-MM-YYYY') || ' · ' || r.locatie,
      round(greatest(0, extract(epoch from (p.einde_iso-p.start_iso))/3600.0 - coalesce(p.pauze_uren,0))::numeric,2),
      r.tarief,
      round(greatest(0, extract(epoch from (p.einde_iso-p.start_iso))/3600.0 - coalesce(p.pauze_uren,0))::numeric * r.tarief,2),
      extract(epoch from p.start_iso)::bigint
    from public.planning p
    where lower(btrim(p.teamlid)) = lower(r.medewerker_naam)
      and coalesce(nullif(btrim(p.locatie),''),'(geen locatie)') = r.locatie
      and to_char(p.start_iso,'YYYY-MM') = v_ym
      and p.start_iso is not null and p.einde_iso is not null
      and coalesce(p.archived,false)=false;
  end loop;

  select count(*) into v_regels
  from public.zzp_factuur_regels rg join public.zzp_facturen f on f.id = rg.factuur_id
  where f.jaar = p_jaar and f.maand = p_maand;

  return jsonb_build_object('maand', v_ym, 'aangemaakt', v_created, 'overgeslagen', v_skipped, 'regels_totaal', v_regels);
end;
$fn$;

-- 3) Veilige herberekening van ONAANGEROERDE klaargezette baseline naar het nieuwe
--    tarief. DIEHARD: raakt NOOIT ingediende/bewerkte/goedgekeurde facturen aan.
create or replace function public.herbereken_zzp_proforma_baseline(p_jaar integer default null, p_maand integer default null)
returns jsonb
language sql
security definer
set search_path to 'public'
as $fn$
  with doel as (
    select f.id, f.proforma_uren, f.ingediend_uren,
           public.zzp_medewerker_uurtarief(f.medewerker_id) as nt
    from public.zzp_facturen f
    where f.status = 'klaargezet'
      and f.submitted_at is null
      and f.eigen_factuurnummer is null
      and f.logo_url is null
      and f.extra_gegevens is null
      and coalesce(f.archived, false) = false
      and (p_jaar  is null or f.jaar  = p_jaar)
      and (p_maand is null or f.maand = p_maand)
      and not exists (
        select 1 from public.zzp_factuur_regels rg
        where rg.factuur_id = f.id and (rg.verwijderd = true or rg.gewijzigd = true)
      )
  ),
  upd_reg as (
    update public.zzp_factuur_regels rg
       set proforma_tarief  = d.nt,
           proforma_bedrag  = round(coalesce(rg.proforma_uren,0) * d.nt, 2),
           ingediend_tarief = d.nt,
           ingediend_bedrag = round(coalesce(rg.ingediend_uren, rg.proforma_uren, 0) * d.nt, 2),
           laatst_gewijzigd = now()
      from doel d
     where rg.factuur_id = d.id
    returning 1
  ),
  upd_fac as (
    update public.zzp_facturen f
       set proforma_tarief  = d.nt,
           proforma_bedrag  = round(coalesce(f.proforma_uren,0) * d.nt, 2),
           ingediend_bedrag = round(coalesce(f.ingediend_uren, f.proforma_uren, 0) * d.nt, 2),
           laatst_gewijzigd = now()
      from doel d
     where f.id = d.id
    returning 1
  )
  select jsonb_build_object(
    'facturen_bijgewerkt', (select count(*) from upd_fac),
    'regels_bijgewerkt',   (select count(*) from upd_reg)
  );
$fn$;

comment on function public.herbereken_zzp_proforma_baseline(integer,integer) is
  'Herberekent ALLEEN onaangeroerde klaargezette proforma-concepten naar het canonieke tarief (zzp_medewerker_uurtarief). Raakt nooit ingediende/bewerkte/goedgekeurde facturen aan. Idempotent.';
