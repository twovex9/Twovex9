-- =============================================================================
-- Werk-werk kilometers (clientvervoer) — goedkeuring door de zorgcoordinator.
-- Toegepast op de productie-DB via apply_migration (2026-06-01); hier vastgelegd
-- voor reproduceerbaarheid. Twee delen:
--   1) approval-velden op kilometer_records  (migratie kilometer_werkwerk_approval_velden)
--   2) meldingen + push-trigger              (migratie kilometer_werkwerk_notify_trigger)
-- Bijbehorende edge-functie: supabase/functions/kilometer-werkwerk-push/.
-- =============================================================================

-- 1) Goedkeur-velden op kilometer_records ------------------------------------
-- Werk-werk (type='werkwerk') vereist goedkeuring; bestaande BS2-types
-- (office/automatic/manual) houden approval_status NULL = n.v.t. Niet-destructief.
alter table public.kilometer_records
  add column if not exists approval_status   text,
  add column if not exists approved_by       uuid references public.medewerkers(id) on delete set null,
  add column if not exists approved_by_naam  text,
  add column if not exists approved_at       timestamptz,
  add column if not exists rejection_reason  text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kilometer_records_approval_status_chk'
  ) then
    alter table public.kilometer_records
      add constraint kilometer_records_approval_status_chk
      check (approval_status is null or approval_status in ('pending','approved','rejected'));
  end if;
end $$;

create index if not exists idx_km_records_pending_approval
  on public.kilometer_records (approval_status)
  where approval_status = 'pending';

-- 2) Meldingen + push --------------------------------------------------------
-- Patroon 1-op-1 van public.taken_notify():
--   A) INSERT van een werk-werk rit (pending) -> de goedkeurders
--      (Zorgcoordinator=slug teamleider + admin/hr/eigenaar/directeur);
--   B) approval_status pending -> approved     -> de medewerker;
--   C) approval_status -> rejected             -> de medewerker (+ reden).
-- In-app via public.notifications; best-effort telefoon-push via pg_net naar de
-- edge-functie kilometer-werkwerk-push (mag de mutatie NOOIT terugdraaien).
create or replace function public.kilometer_werkwerk_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor   uuid := auth.uid();
  v_mw_id   uuid;
  v_jaar    int;
  v_maand   int;
  v_naam    text;
  v_periode text;
  v_km      text := coalesce(NEW.kilometers, 0)::text;
  v_ids     uuid[] := '{}';
  v_chunk   uuid[];
  v_secret  text;
  v_url     text := 'https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/kilometer-werkwerk-push';
  v_maanden text[] := array['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
begin
  if coalesce(NEW.type,'') <> 'werkwerk' then
    return NEW;
  end if;

  select d.medewerker_id, d.jaar, d.maand
    into v_mw_id, v_jaar, v_maand
  from public.kilometer_declaraties d
  where d.id = NEW.declaratie_id;

  v_periode := coalesce(v_maanden[v_maand], coalesce(v_maand::text,'')) || ' ' || coalesce(v_jaar::text,'');

  select btrim(coalesce(m.voornaam,'') || ' ' || coalesce(m.achternaam,''))
    into v_naam
  from public.medewerkers m where m.id = v_mw_id;
  v_naam := coalesce(nullif(v_naam,''), 'Een medewerker');

  -- A) Nieuwe werk-werk rit -> de goedkeurders.
  if tg_op = 'INSERT' and NEW.approval_status = 'pending' then
    with goedkeurders as (
      select distinct pr.id as uid
      from public.bs2_role_users ru
      join public.bs2_roles r on r.id = ru.role_id
      join public.profiles pr on lower(pr.email) = lower(ru.user_email)
      where r.slug in ('teamleider','hr','admin','eigenaar','directeur')
        and pr.id is distinct from v_actor
    ), ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select uid, 'km_werkwerk_aangevraagd',
             'Werk-werk rit ter goedkeuring',
             v_naam || ' heeft een werk-werk rit van ' || v_km || ' km ingediend (' || v_periode || '). Beoordeel deze.',
             'kilometers', NEW.declaratie_id
      from goedkeurders
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  -- B) Goedgekeurd -> de medewerker.
  if tg_op = 'UPDATE' and coalesce(OLD.approval_status,'') = 'pending' and NEW.approval_status = 'approved' then
    with ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select pr.id, 'km_werkwerk_goedgekeurd',
             'Werk-werk rit goedgekeurd',
             'Je werk-werk rit van ' || v_km || ' km (' || v_periode || ') is goedgekeurd en telt mee in je vergoeding.',
             'kilometers', NEW.declaratie_id
      from public.profiles pr
      where pr.medewerker_id = v_mw_id and pr.id is distinct from v_actor
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  -- C) Afgewezen -> de medewerker (+ reden).
  if tg_op = 'UPDATE' and NEW.approval_status = 'rejected' and coalesce(OLD.approval_status,'') <> 'rejected' then
    with ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select pr.id, 'km_werkwerk_afgewezen',
             'Werk-werk rit afgewezen',
             'Je werk-werk rit van ' || v_km || ' km (' || v_periode || ') is afgewezen'
               || coalesce(': ' || nullif(btrim(NEW.rejection_reason),''), '') || '.',
             'kilometers', NEW.declaratie_id
      from public.profiles pr
      where pr.medewerker_id = v_mw_id and pr.id is distinct from v_actor
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  if array_length(v_ids, 1) > 0 then
    begin
      select waarde into v_secret from public.private_app_config where sleutel = 'taken_push_cron_secret';
      if v_secret is not null and v_secret <> '' then
        perform net.http_post(
          url     := v_url,
          body    := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret)
        );
      end if;
    exception when others then
      null;
    end;
  end if;

  return NEW;
end;
$function$;

drop trigger if exists trg_km_werkwerk_notify_ins on public.kilometer_records;
create trigger trg_km_werkwerk_notify_ins
  after insert on public.kilometer_records
  for each row execute function public.kilometer_werkwerk_notify();

drop trigger if exists trg_km_werkwerk_notify_upd on public.kilometer_records;
create trigger trg_km_werkwerk_notify_upd
  after update of approval_status on public.kilometer_records
  for each row execute function public.kilometer_werkwerk_notify();
