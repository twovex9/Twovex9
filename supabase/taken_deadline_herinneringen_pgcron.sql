-- ============================================================================
-- Taak-deadline herinneringen (PL/pgSQL + pg_cron) + telefoon-push (pg_net)
-- ============================================================================
-- Wens (2026-05-31): "Vier dagen van tevoren elke dag een herinnering/signaal
-- in de app dat je taak gaat verlopen." User-keuze: melding op 4, 3, 2 en 1 dag
-- vóór de deadline ÉN op de deadlinedag zelf  =>  deadline in [vandaag .. +4].
-- Dagelijks om 08:00 NL (zomertijd). Ontvanger = de toegewezen medewerker.
--
-- ARCHITECTUUR (zelfde keuze als notify_vervallen_wettelijk_verlof):
--   * In-app notificatie = PURE PL/pgSQL door pg_cron. Betrouwbaar, geen
--     externe-call-failure. Verschijnt in de notification-bell (web) en de
--     Meldingen-tab (mobiele app) — beide lezen public.notifications generiek.
--   * Telefoon-push = BEST-EFFORT laag er bovenop. De functie triggert ná de
--     inserts één pg_net HTTP-call naar de Edge Function `taken-herinnering-push`
--     (Web Push / VAPID). Die call zit in een exception-block: faalt pg_net of
--     de push, dan blijven de in-app meldingen gewoon staan. Push bereikt enkel
--     toestellen die de PWA installeerden + push toestonden (anders 0 ontvangers).
--
-- BRON: public.taken (deadline date; toegewezen_aan_id uuid -> medewerkers.id;
--   status_bs2 '--'/'In behandeling'/'Voltooid'). Ontvanger via profiles.medewerker_id
--   (zelfde koppeling als de bestaande taken_notify-trigger).
--
-- IDEMPOTENT: max 1 herinnering per taak per gebruiker per kalenderdag (NL-tijd).
--   Meermaals draaien op één dag voegt niets dubbel toe. p_dry_run=true schrijft
--   en pusht niets (voor veilige checks).
-- ============================================================================

-- 1. pg_net: async HTTP vanuit Postgres (voor de push-trigger).
create extension if not exists pg_net;

-- 2. Gedeelde cron-secret voor de push-Edge-Function (verify_jwt=false). Server-side
--    gegenereerd; NOOIT in code/git. Idempotent: bestaande secret blijft staan.
insert into public.private_app_config (sleutel, waarde)
select 'taken_push_cron_secret', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.private_app_config where sleutel = 'taken_push_cron_secret');

-- 3. De functie.
create or replace function public.taken_deadline_herinneringen(p_dry_run boolean default false)
returns table (processed integer, inserted integer, skipped integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date        := (now() at time zone 'Europe/Amsterdam')::date;
  v_window_end date        := v_today + 4;
  v_day_start  timestamptz := (v_today::timestamp) at time zone 'Europe/Amsterdam';
  v_processed  integer := 0;
  v_inserted   integer := 0;
  v_skipped    integer := 0;
  r            record;
  v_dagen      integer;
  v_wanneer    text;
  v_titel      text;
  v_body       text;
  v_notif_id   uuid;
  v_ids        uuid[] := '{}';
  v_secret     text;
  v_url        text := 'https://boscwvojcggkbdxhlfys.supabase.co/functions/v1/taken-herinnering-push';
begin
  for r in
    select
      t.id                                                       as taak_id,
      coalesce(nullif(btrim(t.title), ''), t.naam, 'Taak')       as taak_naam,
      t.deadline                                                 as deadline,
      p.id                                                       as user_id
    from public.taken t
    join public.medewerkers mw
      on mw.id = t.toegewezen_aan_id and mw.archived = false
    join public.profiles p
      on p.medewerker_id = t.toegewezen_aan_id
    where t.archived = false
      and coalesce(t.status_bs2, t.status) not in ('Voltooid', 'voltooid')
      and t.deadline is not null
      and t.toegewezen_aan_id is not null
      and t.deadline between v_today and v_window_end
  loop
    v_processed := v_processed + 1;

    -- Idempotency: al een herinnering voor deze taak+gebruiker vandaag?
    if exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id
        and n.type = 'taak_deadline_herinnering'
        and n.related_entity_id = r.taak_id
        and n.created_at >= v_day_start
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_dagen := r.deadline - v_today;  -- 0..4
    if v_dagen <= 0 then
      v_wanneer := 'verloopt vandaag';
    elsif v_dagen = 1 then
      v_wanneer := 'verloopt morgen';
    else
      v_wanneer := 'verloopt over ' || v_dagen || ' dagen';
    end if;

    v_titel := 'Taak ' || v_wanneer || ': ' || r.taak_naam;
    v_body  := 'Je taak "' || r.taak_naam || '" ' || v_wanneer
               || ' (' || to_char(r.deadline, 'DD-MM-YYYY') || '). Vergeet niet om ‘m af te ronden.';

    if not p_dry_run then
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      values (r.user_id, 'taak_deadline_herinnering', v_titel, v_body, 'taken', r.taak_id)
      returning id into v_notif_id;
      v_ids := array_append(v_ids, v_notif_id);
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  -- Best-effort telefoon-push voor de zojuist aangemaakte meldingen.
  -- Mag de in-app meldingen NOOIT raken -> alles in een exception-block.
  if not p_dry_run and array_length(v_ids, 1) > 0 then
    begin
      select waarde into v_secret
        from public.private_app_config
        where sleutel = 'taken_push_cron_secret';
      if v_secret is not null and v_secret <> '' then
        perform net.http_post(
          url     := v_url,
          body    := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret)
        );
      end if;
    exception when others then
      -- push-trigger faalde; in-app meldingen blijven staan, cron-run slaagt.
      null;
    end;
  end if;

  return query select v_processed, v_inserted, v_skipped;
end;
$$;

revoke all on function public.taken_deadline_herinneringen(boolean) from public, anon, authenticated;
grant execute on function public.taken_deadline_herinneringen(boolean) to service_role;

-- 4. pg_cron: elke dag 06:00 UTC = 08:00 NL zomertijd (07:00 NL wintertijd),
--    conform de cron-conventie in deze DB. cron.schedule is idempotent.
select cron.schedule(
  'taken-deadline-herinnering-dagelijks',
  '0 6 * * *',
  $cron$select public.taken_deadline_herinneringen();$cron$
);

-- Verify:    select * from cron.job where jobname = 'taken-deadline-herinnering-dagelijks';
-- Handmatig: select * from public.taken_deadline_herinneringen(true);  -- dry-run
-- Stoppen:   select cron.unschedule('taken-deadline-herinnering-dagelijks');
