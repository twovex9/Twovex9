-- =====================================================================
-- taken_v2_module.sql — Takenmodule uitbreiding (Embrace the Future)
-- ---------------------------------------------------------------------
-- Voegt het onderscheid taak / verzoek / goedkeuring toe, een afdeling-
-- veld, afdeling-gestuurde zichtbaarheid voor verzoeken/besluitpunten,
-- meldingen voor de verzoek- en besluit-flow, en een escalatie-cron.
--
-- Volledig idempotent (her-uitvoeren = zelfde resultaat). De bestaande
-- taak-RLS (`_taken_zichtbaar` + niveaufuncties) en de 519 bestaande
-- taken blijven 1-op-1 werken; deze migratie breidt ALLEEN uit.
--
-- Uitvoeren op productie (ukjflilnhigozfoxowmj):
--   node scripts/db-exec.mjs --file supabase/migrations/taken_v2_module.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nieuwe kolommen + backfill
-- ---------------------------------------------------------------------
alter table public.taken
  add column if not exists type                text,
  add column if not exists afdeling            text,
  add column if not exists omgezet_naar_taak_id text,
  add column if not exists verzoek_van_id       text;

-- Bestaande rijen zijn allemaal gewone taken.
update public.taken set type = 'taak' where type is null;

alter table public.taken alter column type set default 'taak';
alter table public.taken alter column type set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taken_type_check') then
    alter table public.taken
      add constraint taken_type_check check (type in ('taak','verzoek','goedkeuring'));
  end if;
end $$;

create index if not exists taken_type_idx     on public.taken (type)     where archived = false;
create index if not exists taken_afdeling_idx on public.taken (afdeling) where archived = false;

-- ---------------------------------------------------------------------
-- 2. Afdeling-taxonomie (server-side, identiek aan de client-mapping)
--    Afgeleid uit de BS2-rollen van de gebruiker. Een multi-rol-gebruiker
--    kan tot meerdere afdelingen behoren.
-- ---------------------------------------------------------------------
create or replace function public.taken_user_afdelingen(p_user uuid)
returns text[]
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(array_agg(distinct afd) filter (where afd is not null), '{}')
  from (
    select case
      when r.slug = 'hr'                                   then 'HR'
      when r.slug = 'facilitair'                           then 'Facilitair'
      when r.slug = 'beleid'                               then 'Beleid & Kwaliteit'
      when r.slug in ('finance','salarisadministratie')   then 'Financiën'
      when r.slug = 'gedragswetenschapper'                 then 'Gedragswetenschap'
      when r.slug in ('planner','teamleider',
                      'beschikkingen-test')                then 'Planning & Zorg'
      when r.slug in ('directeur','eigenaar','admin')      then 'Directie'
      else null
    end as afd
    from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r       on r.id = ru.role_id
    where p.id = p_user
  ) s;
$$;

create or replace function public.taken_huidige_afdelingen()
returns text[]
language sql stable security definer set search_path to 'public'
as $$ select public.taken_user_afdelingen(auth.uid()); $$;

-- Managers (niveau <= 3) die bij een afdeling horen — ontvangers van verzoeken.
create or replace function public.taken_afdeling_manager_ids(p_afdeling text)
returns table(user_id uuid)
language sql stable security definer set search_path to 'public'
as $$
  select p.id
  from public.profiles p
  where p_afdeling is not null
    and p_afdeling = any (public.taken_user_afdelingen(p.id))
    and public._taken_kijk_niveau(p.id) <= 3;
$$;

-- ---------------------------------------------------------------------
-- 3. Zichtbaarheid v2 = bestaande taak-logica  OR  afdeling-zichtbaarheid
--    voor verzoeken/besluitpunten. Bestaande taken (type='taak') volgen
--    exact de oude `_taken_zichtbaar`-regels.
-- ---------------------------------------------------------------------
create or replace function public._taken_zichtbaar2(
  p_type text, p_afdeling text, p_assignee uuid, p_maker uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select
    public._taken_zichtbaar(p_assignee, p_maker, p_user)
    or (
      coalesce(p_type, 'taak') in ('verzoek','goedkeuring')
      and (
        -- Directie/eigenaar (niveau 1-2) zien alle verzoeken & besluitpunten.
        public._taken_kijk_niveau(p_user) <= 2
        -- Management (niveau 3) ziet verzoeken/besluitpunten van de eigen afdeling.
        or (
          public._taken_kijk_niveau(p_user) <= 3
          and p_afdeling is not null
          and p_afdeling = any (public.taken_user_afdelingen(p_user))
        )
      )
    );
$$;

-- Repoint de 4 permissieve taak-policies naar v2 (RESTRICTIVE bureau_lockout blijft).
drop policy if exists "taken hierarchie lezen"     on public.taken;
create policy "taken hierarchie lezen" on public.taken
  for select to authenticated
  using (public._taken_zichtbaar2(type, afdeling, toegewezen_aan_id, aangemaakt_door_id, auth.uid()));

drop policy if exists "taken hierarchie bewerken"  on public.taken;
create policy "taken hierarchie bewerken" on public.taken
  for update to authenticated
  using (public._taken_zichtbaar2(type, afdeling, toegewezen_aan_id, aangemaakt_door_id, auth.uid()))
  with check (public._taken_zichtbaar2(type, afdeling, toegewezen_aan_id, aangemaakt_door_id, auth.uid()));

drop policy if exists "taken hierarchie toevoegen" on public.taken;
create policy "taken hierarchie toevoegen" on public.taken
  for insert to authenticated
  with check ((aangemaakt_door_id is null) or (aangemaakt_door_id = auth.uid()));

drop policy if exists "taken hierarchie verwijderen" on public.taken;
create policy "taken hierarchie verwijderen" on public.taken
  for delete to authenticated
  using (public._taken_zichtbaar2(type, afdeling, toegewezen_aan_id, aangemaakt_door_id, auth.uid()));

-- ---------------------------------------------------------------------
-- 4. UI-context-RPC: niveau, afdelingen en of de gebruiker taken/
--    besluitpunten mag aanmaken (= management of hoger, niveau <= 3).
-- ---------------------------------------------------------------------
create or replace function public.taken_mijn_context()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'niveau',        public._taken_kijk_niveau(auth.uid()),
    'afdelingen',    coalesce(to_jsonb(public.taken_huidige_afdelingen()), '[]'::jsonb),
    'kan_beheren',   public._taken_kijk_niveau(auth.uid()) <= 3,
    'is_directie',   public._taken_kijk_niveau(auth.uid()) <= 2
  );
$$;
grant execute on function public.taken_mijn_context() to authenticated;
grant execute on function public.taken_huidige_afdelingen() to authenticated;
grant execute on function public.taken_user_afdelingen(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Meldingen-trigger uitbreiden (verzoek- en besluit-flow).
--    De bestaande taak-branches (A-D) blijven ongewijzigd; E-H zijn nieuw
--    en vuren alleen voor type in ('verzoek','goedkeuring').
-- ---------------------------------------------------------------------
create or replace function public.taken_notify()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_actor   uuid   := auth.uid();
  v_oldstat text   := coalesce(OLD.status_bs2, OLD.status);
  v_newstat text   := coalesce(NEW.status_bs2, NEW.status);
  v_titel   text   := coalesce(nullif(btrim(NEW.title), ''), NEW.naam, 'Taak');
  v_ids     uuid[] := '{}';
  v_chunk   uuid[];
  v_id      uuid;
  v_secret  text;
  v_url     text   := 'https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/taken-herinnering-push';
begin
  -- A) Toewijzing (insert met assignee, of assignee gewijzigd) -> naar de medewerker.
  if NEW.toegewezen_aan_id is not null and (
       tg_op = 'INSERT'
       or OLD.toegewezen_aan_id is distinct from NEW.toegewezen_aan_id
     ) then
    with ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select pr.id, 'taak_toegewezen',
             'Nieuwe taak: ' || v_titel,
             'Er is een taak aan je toegewezen.',
             'taken', NEW.id
      from public.profiles pr
      where pr.medewerker_id = NEW.toegewezen_aan_id
        and pr.id is distinct from v_actor
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  -- B) Voltooid -> melding naar de maker (tenzij de maker zelf voltooit).
  if tg_op = 'UPDATE' and v_newstat = 'Voltooid' and coalesce(v_oldstat, '') <> 'Voltooid'
     and NEW.aangemaakt_door_id is not null
     and NEW.aangemaakt_door_id is distinct from v_actor then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (NEW.aangemaakt_door_id, 'taak_voltooid',
            'Taak voltooid: ' || v_titel,
            'Een door jou uitgezette taak is voltooid. Controleer en keur goed.',
            'taken', NEW.id)
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end if;

  -- C) Goedgekeurd -> melding naar de toegewezen medewerker (uitvoerder).
  if tg_op = 'UPDATE' and OLD.goedgekeurd_op is null and NEW.goedgekeurd_op is not null
     and NEW.toegewezen_aan_id is not null then
    with ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select pr.id, 'taak_goedgekeurd',
             'Taak goedgekeurd: ' || v_titel,
             'Je voltooide taak is goedgekeurd en afgerond.',
             'taken', NEW.id
      from public.profiles pr
      where pr.medewerker_id = NEW.toegewezen_aan_id
        and pr.id is distinct from v_actor
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  -- D) Afgekeurd (Voltooid -> In behandeling) -> melding naar de toegewezen medewerker.
  if tg_op = 'UPDATE' and v_oldstat = 'Voltooid' and v_newstat = 'In behandeling'
     and NEW.toegewezen_aan_id is not null then
    with ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select pr.id, 'taak_afgekeurd',
             'Taak afgekeurd: ' || v_titel,
             'De aanmaker vraagt je deze taak opnieuw te bekijken.',
             'taken', NEW.id
      from public.profiles pr
      where pr.medewerker_id = NEW.toegewezen_aan_id
        and pr.id is distinct from v_actor
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  -- E) Verzoek ingediend (INSERT type='verzoek') -> naar de afdeling-managers.
  if tg_op = 'INSERT' and NEW.type = 'verzoek' and NEW.afdeling is not null then
    with ins as (
      insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
      select m.user_id, 'verzoek_ingediend',
             'Nieuw verzoek (' || NEW.afdeling || '): ' || v_titel,
             'Er is een verzoek ingediend dat beoordeeld moet worden.',
             'taken', NEW.id
      from public.taken_afdeling_manager_ids(NEW.afdeling) m
      where m.user_id is distinct from v_actor
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_chunk from ins;
    v_ids := v_ids || v_chunk;
  end if;

  -- F) Verzoek beoordeeld (status-overgang) -> melding naar de indiener.
  if tg_op = 'UPDATE' and NEW.type = 'verzoek'
     and v_newstat is distinct from v_oldstat
     and NEW.aangemaakt_door_id is not null
     and NEW.aangemaakt_door_id is distinct from v_actor
     and v_newstat in ('Goedgekeurd','Afgewezen','Teruggestuurd') then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (NEW.aangemaakt_door_id,
            case v_newstat
              when 'Goedgekeurd'  then 'verzoek_goedgekeurd'
              when 'Afgewezen'    then 'verzoek_afgewezen'
              else 'verzoek_teruggestuurd' end,
            'Verzoek ' || lower(v_newstat) || ': ' || v_titel,
            case v_newstat
              when 'Goedgekeurd'  then 'Je verzoek is goedgekeurd en omgezet naar een taak.'
              when 'Afgewezen'    then 'Je verzoek is afgewezen. Bekijk de toelichting.'
              else 'Je verzoek is teruggestuurd voor aanvullende informatie.' end,
            'taken', NEW.id)
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end if;

  -- G) Besluitpunt genomen (goedkeuring: status -> Goedgekeurd/Afgekeurd) -> naar de maker.
  if tg_op = 'UPDATE' and NEW.type = 'goedkeuring'
     and v_newstat is distinct from v_oldstat
     and v_newstat in ('Goedgekeurd','Afgekeurd')
     and NEW.aangemaakt_door_id is not null
     and NEW.aangemaakt_door_id is distinct from v_actor then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (NEW.aangemaakt_door_id,
            case v_newstat when 'Goedgekeurd' then 'besluit_goedgekeurd' else 'besluit_afgekeurd' end,
            'Besluit ' || lower(v_newstat) || ': ' || v_titel,
            'Er is een besluit genomen over een door jou ingediend besluitpunt.',
            'taken', NEW.id)
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end if;

  -- Best-effort telefoon-push (Web Push) bovenop de in-app meldingen.
  if array_length(v_ids, 1) > 0 then
    begin
      select waarde into v_secret from public.private_app_config
        where sleutel = 'taken_push_cron_secret';
      if v_secret is not null and v_secret <> '' then
        perform net.http_post(
          url     := v_url,
          body    := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret)
        );
      end if;
    exception when others then null;
    end;
  end if;

  return NEW;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Escalatie van achterstallige taken (type='taak').
--    Conform het platform-principe "directie/eigenaar sturen op
--    uitzonderingen, niet op details":
--      * Uitvoerder       : per-taak dagelijkse herinnering (eigen werk).
--      * Afdeling-mgmt     : per-taak, hoogstens 1× per 7 dagen (dag 2+).
--      * Directie/eigenaar : één dagelijkse DIGEST met het aantal kritiek
--                            achterstallige taken (dag 4+), niet per taak.
--    Idempotent per categorie (uitvoerder/digest = per dag, mgmt = per week).
-- ---------------------------------------------------------------------
create or replace function public.taken_escalatie(p_dry_run boolean default false)
returns table(processed integer, inserted integer, skipped integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today     date        := (now() at time zone 'Europe/Amsterdam')::date;
  v_day_start timestamptz := (v_today::timestamp) at time zone 'Europe/Amsterdam';
  v_week_ago  timestamptz := now() - interval '7 days';
  v_processed integer := 0;
  v_inserted  integer := 0;
  v_skipped   integer := 0;
  r           record;
  v_recip     record;
  v_dagen     integer;
  v_titel     text;
  v_notif_id  uuid;
  v_ids       uuid[] := '{}';
  v_kritiek   integer := 0;   -- aantal taken >= 4 dagen te laat (voor de digest)
  v_secret    text;
  v_url       text := 'https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/taken-herinnering-push';
begin
  for r in
    select t.id as taak_id,
           coalesce(nullif(btrim(t.title), ''), t.naam, 'Taak') as taak_naam,
           t.deadline, t.afdeling, t.toegewezen_aan_id,
           (v_today - t.deadline) as dagen_te_laat
    from public.taken t
    where t.archived = false
      and coalesce(t.type, 'taak') = 'taak'
      and coalesce(t.status_bs2, t.status) not in ('Voltooid','voltooid','Afgerond','Geannuleerd')
      and t.deadline is not null
      and t.toegewezen_aan_id is not null
      and t.deadline < v_today
  loop
    v_processed := v_processed + 1;
    v_dagen := r.dagen_te_laat;
    v_titel := 'Achterstallige taak (' || v_dagen || ' dagen te laat): ' || r.taak_naam;
    if v_dagen >= 4 then v_kritiek := v_kritiek + 1; end if;

    -- Per-persoon escalaties: uitvoerder (dagelijks) + afdeling-management (wekelijks).
    for v_recip in
      select pr.id as user_id, 'taak_escalatie_uitvoerder'::text as ntype, v_day_start as sinds
      from public.profiles pr
      where pr.medewerker_id = r.toegewezen_aan_id
      union
      select m.user_id, 'taak_escalatie_management', v_week_ago
      from public.taken_afdeling_manager_ids(r.afdeling) m
      where v_dagen >= 2
        and m.user_id not in (
          select pr.id from public.profiles pr where pr.medewerker_id = r.toegewezen_aan_id)
    loop
      if v_recip.user_id is null then continue; end if;
      if exists (
        select 1 from public.notifications n
        where n.user_id = v_recip.user_id
          and n.type = v_recip.ntype
          and n.related_entity_id = r.taak_id
          and n.created_at >= v_recip.sinds
      ) then
        v_skipped := v_skipped + 1; continue;
      end if;
      if not p_dry_run then
        insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
        values (v_recip.user_id, v_recip.ntype, v_titel,
                'Deze taak is ' || v_dagen || ' dag(en) over de deadline. Onderneem actie of herverdeel.',
                'taken', r.taak_id)
        returning id into v_notif_id;
        v_ids := array_append(v_ids, v_notif_id);
      end if;
      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  -- Directie/eigenaar (niveau <= 2): één dagelijkse digest als er kritiek
  -- achterstallige taken zijn. Idempotent per dag (related_entity_id = 'digest').
  if v_kritiek > 0 then
    for v_recip in
      select pr.id as user_id from public.profiles pr
      where public._taken_kijk_niveau(pr.id) <= 2
    loop
      if exists (
        select 1 from public.notifications n
        where n.user_id = v_recip.user_id
          and n.type = 'taak_escalatie_digest'
          and n.related_entity_id = 'digest'
          and n.created_at >= v_day_start
      ) then
        v_skipped := v_skipped + 1; continue;
      end if;
      if not p_dry_run then
        insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
        values (v_recip.user_id, 'taak_escalatie_digest',
                v_kritiek || ' taken zijn kritiek achterstallig',
                'Er ' || (case when v_kritiek = 1 then 'is 1 taak' else 'zijn ' || v_kritiek || ' taken' end)
                  || ' meer dan 4 dagen over de deadline. Bekijk het Managementoverzicht in Taken.',
                'taken', 'digest')
        returning id into v_notif_id;
        v_ids := array_append(v_ids, v_notif_id);
      end if;
      v_inserted := v_inserted + 1;
    end loop;
  end if;

  if not p_dry_run and array_length(v_ids, 1) > 0 then
    begin
      select waarde into v_secret from public.private_app_config
        where sleutel = 'taken_push_cron_secret';
      if v_secret is not null and v_secret <> '' then
        perform net.http_post(
          url     := v_url,
          body    := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret)
        );
      end if;
    exception when others then null;
    end;
  end if;

  return query select v_processed, v_inserted, v_skipped;
end;
$function$;

revoke all on function public.taken_escalatie(boolean) from public, anon, authenticated;
grant execute on function public.taken_escalatie(boolean) to service_role;

-- Dagelijkse cron om 06:15 (na de deadline-herinnering van 06:00).
do $$ begin
  if exists (select 1 from cron.job where jobname = 'taken-escalatie-dagelijks') then
    perform cron.unschedule('taken-escalatie-dagelijks');
  end if;
  perform cron.schedule('taken-escalatie-dagelijks', '15 6 * * *',
                        $cron$select public.taken_escalatie();$cron$);
end $$;
