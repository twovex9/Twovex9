-- ============================================================================
-- HR Module v4 — G8: actieve verloopbewaking documenten (kern-differentiator)
-- ============================================================================
-- Dagelijkse digest-notificatie naar HR met tellingen per drempel (verlopen /
-- 30 / 60 / 90 dagen). De itemized 90/60/30-lijst staat op het Compliance-dashboard
-- + per-medewerker waarschuwings-UI. Digest i.p.v. per-doc-notificatie voorkomt
-- flooding (1 notificatie per HR-user per dag i.p.v. honderden).
-- Steunt op medewerker_documenten.vervaldatum_date (Fase 0, hr_v4_fase0_fundament.sql).
-- Idempotent. Patroon = notify_vervallen_wettelijk_verlof.
-- ============================================================================

create or replace function public.notify_vervallende_documenten()
 returns table(processed integer, inserted integer, skipped integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_verlopen int; v_d30 int; v_d60 int; v_d90 int; v_total int;
  v_inserted int := 0; v_skipped int := 0; v_processed int := 0;
  hr record; v_title text; v_body text;
begin
  select
    count(*) filter (where vervaldatum_date < v_today),
    count(*) filter (where vervaldatum_date >= v_today and vervaldatum_date <= v_today + 30),
    count(*) filter (where vervaldatum_date > v_today + 30 and vervaldatum_date <= v_today + 60),
    count(*) filter (where vervaldatum_date > v_today + 60 and vervaldatum_date <= v_today + 90)
  into v_verlopen, v_d30, v_d60, v_d90
  from public.medewerker_documenten
  where coalesce(archived, false) = false and vervaldatum_date is not null;

  v_verlopen := coalesce(v_verlopen, 0);
  v_d30 := coalesce(v_d30, 0);
  v_d60 := coalesce(v_d60, 0);
  v_d90 := coalesce(v_d90, 0);
  v_total := v_verlopen + v_d30 + v_d60 + v_d90;

  if v_total = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  v_title := 'Documentbewaking: ' || v_verlopen || ' verlopen, ' || v_d30 || ' binnen 30 dagen';
  v_body := 'Documentstatus vandaag: ' || v_verlopen || ' verlopen, ' || v_d30
    || ' verlopen binnen 30 dagen, ' || v_d60 || ' binnen 60 dagen, ' || v_d90
    || ' binnen 90 dagen. Bekijk het Compliance-dashboard voor de details per medewerker.';

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
        and n.type = 'doc_verloop_digest'
        and (n.created_at at time zone 'Europe/Amsterdam')::date = v_today
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (hr.user_id, 'doc_verloop_digest', v_title, v_body, 'compliance', 'documenten');
    v_inserted := v_inserted + 1;
  end loop;

  return query select v_processed, v_inserted, v_skipped;
end;
$function$;

-- Dagelijkse cron 06:30 (UTC; vergelijkbaar met andere HR-jobs). Idempotent: unschedule eerst.
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'notify-vervallende-documenten-dagelijks') then
    perform cron.unschedule('notify-vervallende-documenten-dagelijks');
  end if;
  perform cron.schedule('notify-vervallende-documenten-dagelijks', '30 6 * * *',
    'select public.notify_vervallende_documenten();');
end;
$cron$;

select 'hr_v4_verloop_documenten_cron OK' as result;
