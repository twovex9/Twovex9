-- ============================================================================
-- v3 Fase H — April-notificatie wettelijk verlof (PL/pgSQL + pg_cron)
-- ============================================================================
-- Maakt het laatste item uit de HR + Planning roadmap 2026-05-27 af:
--   "Notificatie in april voor medewerkers van wie wettelijk verlof binnen
--    3 maanden (1 juli) vervalt"
--
-- AANPAK: PL/pgSQL-functie + pg_cron in plaats van edge function + HTTP-call.
-- Geen pg_net nodig, geen externe-call-failure, geen HTTP-overhead. De
-- bestaande edge function `notify-vervallen-wettelijk-verlof` (uit PR #346)
-- blijft beschikbaar voor handmatige dry-run vanuit Supabase dashboard.
--
-- IDEMPOTENT: skip als er voor dit jaar al een notification van type
-- 'verlof_vervalt_warning' is voor de medewerker-overdracht. Veilig om
-- meermaals aan te roepen (april+mei+juni cron-uitvoer geeft maximaal 1
-- notificatie per medewerker per jaar).
--
-- BRON-VAN-WAARHEID:
--   - `medewerker_verlof_overgedragen.wet_beschikbaar` > 0 = openstaande
--     wettelijke uren uit vorig jaar (vervallen per 1 juli).
--   - Match medewerker → user via lower(trim(email)).
--   - Insert in `public.notifications` (gelezen door notification-bell in
--     topbar, bestaat sinds Phase 2).
--
-- CRON-SCHEMA: "0 7 1 4,5,6 *" = 07:00 UTC op 1 april/mei/juni
--   = 09:00 Europe/Amsterdam in zomertijd (CEST, UTC+2)
-- ============================================================================

create or replace function public.notify_vervallen_wettelijk_verlof()
returns table (processed integer, inserted integer, skipped integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now() at time zone 'Europe/Amsterdam')::int;
  v_year_start timestamptz := make_timestamptz(v_year, 1, 1, 0, 0, 0, 'UTC');
  v_processed integer := 0;
  v_inserted integer := 0;
  v_skipped integer := 0;
  r record;
  v_uren numeric;
  v_uren_label text;
begin
  for r in
    select
      mvo.id              as overdracht_id,
      mvo.medewerker_id   as medewerker_id,
      mvo.wet_beschikbaar as wet_beschikbaar,
      mw.email            as mw_email,
      p.id                as user_id
    from public.medewerker_verlof_overgedragen mvo
    join public.medewerkers mw
      on mw.id = mvo.medewerker_id::uuid and mw.archived = false
    join public.profiles p
      on lower(trim(p.email)) = lower(trim(mw.email))
    where mvo.wet_beschikbaar > 0
  loop
    v_processed := v_processed + 1;

    -- Idempotency: skip als al gewaarschuwd dit jaar voor deze overdracht
    if exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id
        and n.type = 'verlof_vervalt_warning'
        and n.related_entity_id = r.overdracht_id
        and n.created_at >= v_year_start
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_uren := r.wet_beschikbaar;
    -- Hele uren zonder decimaal; anders 1 decimaal met komma (NL-stijl)
    if abs(v_uren - round(v_uren)) < 0.05 then
      v_uren_label := round(v_uren)::text;
    else
      v_uren_label := replace(to_char(v_uren, 'FM999990.0'), '.', ',');
    end if;

    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (
      r.user_id,
      'verlof_vervalt_warning',
      'Let op: wettelijk verlof vervalt 1 juli',
      'Je hebt nog ' || v_uren_label || ' uren wettelijk verlof open uit het vorige jaar. Plan ze in vóór 1 juli, anders vervallen ze.',
      'medewerker_verlof_overgedragen',
      r.overdracht_id
    );

    v_inserted := v_inserted + 1;
  end loop;

  return query select v_processed, v_inserted, v_skipped;
end;
$$;

revoke all on function public.notify_vervallen_wettelijk_verlof() from public, anon, authenticated;
grant execute on function public.notify_vervallen_wettelijk_verlof() to service_role;

-- pg_cron job: 1e dag van april, mei, juni om 09:00 NL-zomertijd (07:00 UTC).
-- cron.schedule is idempotent: bestaande job met dezelfde naam wordt
-- bijgewerkt zonder error.
select cron.schedule(
  'notify-verlof-vervalt-april-juni',
  '0 7 1 4,5,6 *',
  $cron$select public.notify_vervallen_wettelijk_verlof();$cron$
);
