-- ============================================================================
-- HR Module v4 — Periodieken: jaarlijkse trede-verhogings-signalering (loondienst)
-- ============================================================================
-- hr_periodieken_overzicht(): per loondienst-medewerker met schaal/trede:
--   Laatste ingangsdatum = meest recente medewerker_salaris_historie.ingangsdatum
--   Fallback: data->>'startdatum' (ISO of NL-formaat) → aanmaakdatum
--   Volgende periodiek = laatste_ingangsdatum + 1 jaar
--   Status: te_laat / urgent (≤30d) / binnenkort (31–60d) / ok (>60d)
-- notify_periodieken(): dagelijkse digest naar HR-rollen.
-- Idempotent.
-- ============================================================================

-- RPC: hr_periodieken_overzicht — SECURITY DEFINER, office-only gate
create or replace function public.hr_periodieken_overzicht()
  returns table(
    medewerker_id        text,
    naam                 text,
    schaal               text,
    trede                text,
    laatste_ingangsdatum date,
    volgende_periodiek   date,
    dagen_tot_periodiek  integer,
    status               text
  )
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if not public.is_office_staff() then
    raise exception 'Toegang geweigerd' using errcode = '42501';
  end if;

  return query
  with loondienst_mw as (
    select
      m.id::text as mw_id,
      coalesce(
        nullif(trim(coalesce(m.voornaam,'') || ' ' || coalesce(m.achternaam,'')), ''),
        m.data->>'naam', m.email, m.id::text
      ) as mw_naam,
      m.data->>'salarisschaal' as mw_schaal,
      m.data->>'salaristrede'  as mw_trede,
      -- startdatum: ISO (YYYY-MM-DD) → NL (DD-MM-YYYY) → aanmaakdatum
      case
        when (m.data->>'startdatum') ~ '^\d{4}-\d{2}-\d{2}$'
          then (m.data->>'startdatum')::date
        when (m.data->>'startdatum') ~ '^\d{2}-\d{2}-\d{4}$'
          then to_date(m.data->>'startdatum', 'DD-MM-YYYY')
        else m.aanmaakdatum::date
      end as mw_startdatum
    from public.medewerkers m
    where coalesce(m.archived, false) = false
      and (
        lower(coalesce(m.dienstverband, '')) = 'loondienst'
        or lower(coalesce(m.data->>'dienstverband', '')) = 'loondienst'
      )
      and coalesce(m.data->>'salarisschaal', '') <> ''
      and lower(coalesce(m.data->>'salarisschaal', '')) not like 'selecteer%'
  ),
  laatste_salaris as (
    select distinct on (msh.medewerker_id)
      msh.medewerker_id,
      msh.ingangsdatum,
      msh.trede
    from public.medewerker_salaris_historie msh
    order by msh.medewerker_id, msh.ingangsdatum desc nulls last
  ),
  computed as (
    select
      lm.mw_id                                       as medewerker_id,
      lm.mw_naam                                     as naam,
      lm.mw_schaal                                   as schaal,
      coalesce(ls.trede, lm.mw_trede, '?')          as trede,
      coalesce(ls.ingangsdatum, lm.mw_startdatum)   as laatste_ingangsdatum,
      (coalesce(ls.ingangsdatum, lm.mw_startdatum)
        + interval '1 year')::date                  as volgende_periodiek,
      ((coalesce(ls.ingangsdatum, lm.mw_startdatum)
        + interval '1 year')::date - v_today)::integer as dagen_tot_periodiek,
      case
        when (coalesce(ls.ingangsdatum, lm.mw_startdatum)
          + interval '1 year')::date < v_today
          then 'te_laat'
        when (coalesce(ls.ingangsdatum, lm.mw_startdatum)
          + interval '1 year')::date <= v_today + 30
          then 'urgent'
        when (coalesce(ls.ingangsdatum, lm.mw_startdatum)
          + interval '1 year')::date <= v_today + 60
          then 'binnenkort'
        else 'ok'
      end as status
    from loondienst_mw lm
    left join laatste_salaris ls on ls.medewerker_id = lm.mw_id
  )
  select
    c.medewerker_id,
    c.naam,
    c.schaal,
    c.trede,
    c.laatste_ingangsdatum,
    c.volgende_periodiek,
    c.dagen_tot_periodiek,
    c.status
  from computed c
  order by
    case c.status
      when 'te_laat'    then 0
      when 'urgent'     then 1
      when 'binnenkort' then 2
      else 3
    end,
    c.volgende_periodiek asc;
end;
$function$;


-- Cron-functie: dagelijkse digest naar HR-rollen
create or replace function public.notify_periodieken()
  returns table(processed integer, inserted integer, skipped integer)
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_today     date := (now() at time zone 'Europe/Amsterdam')::date;
  v_telaat    int; v_urgent int; v_binnenkort int; v_total int;
  v_inserted  int := 0; v_skipped int := 0; v_processed int := 0;
  hr          record; v_title text; v_body text;
begin
  -- Tel aantallen per categorie (direct op tabellen — geen auth-context in cron)
  with loondienst_mw as (
    select
      m.id::text as mw_id,
      case
        when (m.data->>'startdatum') ~ '^\d{4}-\d{2}-\d{2}$'
          then (m.data->>'startdatum')::date
        when (m.data->>'startdatum') ~ '^\d{2}-\d{2}-\d{4}$'
          then to_date(m.data->>'startdatum', 'DD-MM-YYYY')
        else m.aanmaakdatum::date
      end as mw_startdatum
    from public.medewerkers m
    where coalesce(m.archived, false) = false
      and (
        lower(coalesce(m.dienstverband, '')) = 'loondienst'
        or lower(coalesce(m.data->>'dienstverband', '')) = 'loondienst'
      )
      and coalesce(m.data->>'salarisschaal', '') <> ''
      and lower(coalesce(m.data->>'salarisschaal', '')) not like 'selecteer%'
  ),
  laatste_salaris as (
    select distinct on (msh.medewerker_id)
      msh.medewerker_id,
      msh.ingangsdatum
    from public.medewerker_salaris_historie msh
    order by msh.medewerker_id, msh.ingangsdatum desc nulls last
  ),
  periodieken as (
    select
      (coalesce(ls.ingangsdatum, lm.mw_startdatum) + interval '1 year')::date as volgende
    from loondienst_mw lm
    left join laatste_salaris ls on ls.medewerker_id = lm.mw_id
  )
  select
    count(*) filter (where volgende < v_today),
    count(*) filter (where volgende >= v_today and volgende <= v_today + 30),
    count(*) filter (where volgende > v_today + 30 and volgende <= v_today + 60)
  into v_telaat, v_urgent, v_binnenkort
  from periodieken;

  v_telaat    := coalesce(v_telaat, 0);
  v_urgent    := coalesce(v_urgent, 0);
  v_binnenkort := coalesce(v_binnenkort, 0);
  v_total     := v_telaat + v_urgent + v_binnenkort;

  if v_total = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  v_title := 'Periodieken: ' || v_telaat || ' te laat, ' || v_urgent
    || ' binnen 30 d, ' || v_binnenkort || ' binnen 60 d';
  v_body  := 'Jaarlijkse trede-verhogingen (loondienst): '
    || v_telaat    || ' medewerker(s) over de datum — direct actie vereist. '
    || v_urgent    || ' medewerker(s) binnen 30 dagen. '
    || v_binnenkort || ' medewerker(s) binnen 60 dagen. '
    || 'Bekijk het Compliance-dashboard → Periodieken voor een volledig overzicht.';

  for hr in
    select distinct p.id as user_id
    from public.profiles p
    join public.bs2_role_users ru on lower(trim(ru.user_email)) = lower(trim(p.email))
    join public.bs2_roles rr on rr.id = ru.role_id
    where rr.slug in ('hr', 'salarisadministratie') or p.rol = 'admin'
  loop
    v_processed := v_processed + 1;
    if exists (
      select 1 from public.notifications n
      where n.user_id = hr.user_id
        and n.type = 'periodieken_digest'
        and (n.created_at at time zone 'Europe/Amsterdam')::date = v_today
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.notifications
      (user_id, type, title, body, related_entity_type, related_entity_id)
    values
      (hr.user_id, 'periodieken_digest', v_title, v_body, 'hr', 'periodieken');
    v_inserted := v_inserted + 1;
  end loop;

  return query select v_processed, v_inserted, v_skipped;
end;
$function$;


-- Cron-job: dagelijks om 06:40 UTC (5 minuten na poortwachter-cron)
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'notify-periodieken-dagelijks') then
    perform cron.unschedule('notify-periodieken-dagelijks');
  end if;
  perform cron.schedule('notify-periodieken-dagelijks', '40 6 * * *',
    'select public.notify_periodieken();');
end;
$cron$;

select 'hr_v4_periodieken_signalering OK' as result;
