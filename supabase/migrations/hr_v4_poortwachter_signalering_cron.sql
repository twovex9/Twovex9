-- ============================================================================
-- HR Module v4 — G32: poortwachter-signalering (Wet Verbetering Poortwachter)
-- ============================================================================
-- Dagelijkse digest naar HR met aantal OPEN verzuim-mijlpalen die te laat zijn of
-- binnen 14 dagen vervallen. Detail per casus staat op het Verzuim-dashboard.
-- Idempotent. Steunt op verzuim_mijlpalen (Fase 0).
-- ============================================================================

create or replace function public.notify_poortwachter_deadlines()
 returns table(processed integer, inserted integer, skipped integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_telaat int; v_binnen14 int; v_total int;
  v_inserted int := 0; v_skipped int := 0; v_processed int := 0;
  hr record; v_title text; v_body text;
begin
  select
    count(*) filter (where deadline_datum < v_today),
    count(*) filter (where deadline_datum >= v_today and deadline_datum <= v_today + 14)
  into v_telaat, v_binnen14
  from public.verzuim_mijlpalen
  where voltooid_op is null and deadline_datum is not null;

  v_telaat := coalesce(v_telaat, 0);
  v_binnen14 := coalesce(v_binnen14, 0);
  v_total := v_telaat + v_binnen14;

  if v_total = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  v_title := 'Poortwachter: ' || v_telaat || ' te laat, ' || v_binnen14 || ' binnen 14 dagen';
  v_body := 'Wet Verbetering Poortwachter: ' || v_telaat || ' verzuim-actie(s) over de deadline en '
    || v_binnen14 || ' actie(s) binnen 14 dagen. Bekijk het Verzuim-dossier voor de details per medewerker.';

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
        and n.type = 'poortwachter_digest'
        and (n.created_at at time zone 'Europe/Amsterdam')::date = v_today
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (hr.user_id, 'poortwachter_digest', v_title, v_body, 'verzuim', 'mijlpalen');
    v_inserted := v_inserted + 1;
  end loop;

  return query select v_processed, v_inserted, v_skipped;
end;
$function$;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'notify-poortwachter-deadlines-dagelijks') then
    perform cron.unschedule('notify-poortwachter-deadlines-dagelijks');
  end if;
  perform cron.schedule('notify-poortwachter-deadlines-dagelijks', '35 6 * * *',
    'select public.notify_poortwachter_deadlines();');
end;
$cron$;

select 'hr_v4_poortwachter_signalering_cron OK' as result;
