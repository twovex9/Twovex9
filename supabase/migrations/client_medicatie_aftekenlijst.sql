-- ============================================================================
-- Medicatie + aftekenlijst (cliëntdossier)
-- ----------------------------------------------------------------------------
-- Per cliënt medicatie vastleggen (naam/dosering/instructie) met de dagdelen
-- (ochtend/middag/avond) waarop afgetekend moet worden. De aftekenlijst houdt
-- per dag/dagdeel bij of de medicatie is gegeven. Een gemist dagdeel wordt
-- automatisch een incident: de cron `medicatie_dagdeel_run` cascadeert per
-- dagdeel-grens (ochtend gemist -> incident vanaf de middag; middag gemist ->
-- vanaf de avond; avond gemist -> de volgende ochtend). De medewerker die die
-- dag bij de cliënt op de planning staat krijgt per medicatiemoment een
-- aftekenherinnering.
--
-- DIEHARD: niets verwijdert data. Floor-medewerkers tekenen af via de
-- SECURITY DEFINER RPC `medicatie_afteken` (directe write blijft office-only).
-- Hergebruikt bestaande helpers is_office_staff() / is_bureau_only_user() /
-- ff_planner_hr_user_ids() en het meldingen-/incidenten-model 1-op-1.
-- ============================================================================

-- 1. Definitie-tabel: medicatie per cliënt -----------------------------------
create table if not exists public.client_medicatie (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null,
  naam             text not null,
  dosering         text,
  vorm             text,
  instructie       text,
  dagdelen         text[]  not null default '{}',                 -- subset {ochtend,middag,avond}
  weekdagen        int[]   not null default '{1,2,3,4,5,6,7}',    -- ISO dow 1=ma .. 7=zo
  aftekenen        boolean not null default true,                 -- vereist dagelijks aftekenen
  startdatum       date,
  einddatum        date,
  actief           boolean not null default true,
  notitie          text,
  archived         boolean not null default false,
  aanmaakdatum     timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);
create index if not exists client_medicatie_client_idx on public.client_medicatie(client_id);

-- 2. Aftekening-/gemist-tabel ------------------------------------------------
create table if not exists public.client_medicatie_aftekening (
  id               uuid primary key default gen_random_uuid(),
  medicatie_id     uuid not null references public.client_medicatie(id) on delete cascade,
  client_id        text not null,
  datum            date not null,
  dagdeel          text not null,                                 -- ochtend | middag | avond
  status           text not null default 'gegeven',               -- gegeven | niet_gegeven | gemist
  medewerker_id    uuid,
  afgetekend_door  text,
  afgetekend_op    timestamptz,
  reden            text,
  notitie          text,
  incident_id      uuid,
  aanmaakdatum     timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  constraint client_medicatie_aftekening_uniek unique (medicatie_id, datum, dagdeel)
);
create index if not exists cma_client_datum_idx on public.client_medicatie_aftekening(client_id, datum);
create index if not exists cma_medicatie_idx     on public.client_medicatie_aftekening(medicatie_id);

-- 3. Triggers: laatst_gewijzigd ----------------------------------------------
drop trigger if exists trg_client_medicatie_modified on public.client_medicatie;
create trigger trg_client_medicatie_modified before update on public.client_medicatie
  for each row execute function public.set_laatst_gewijzigd();

drop trigger if exists trg_cma_modified on public.client_medicatie_aftekening;
create trigger trg_cma_modified before update on public.client_medicatie_aftekening
  for each row execute function public.set_laatst_gewijzigd();

-- 4. RLS ---------------------------------------------------------------------
alter table public.client_medicatie            enable row level security;
alter table public.client_medicatie_aftekening enable row level security;

-- bureau-only gebruikers (detacheringsbureau) volledig uitsluiten (restrictive)
drop policy if exists "bureau_lockout" on public.client_medicatie;
create policy "bureau_lockout" on public.client_medicatie as restrictive for all to authenticated
  using (not public.is_bureau_only_user()) with check (not public.is_bureau_only_user());
drop policy if exists "bureau_lockout" on public.client_medicatie_aftekening;
create policy "bureau_lockout" on public.client_medicatie_aftekening as restrictive for all to authenticated
  using (not public.is_bureau_only_user()) with check (not public.is_bureau_only_user());

-- client_medicatie: lezen = elke auth (ook werkvloer, om af te kunnen tekenen);
-- definiëren/wijzigen/verwijderen = uitsluitend kantoorpersoneel.
drop policy if exists "medicatie select" on public.client_medicatie;
create policy "medicatie select" on public.client_medicatie for select to authenticated using (true);
drop policy if exists "medicatie insert" on public.client_medicatie;
create policy "medicatie insert" on public.client_medicatie for insert to authenticated with check (public.is_office_staff());
drop policy if exists "medicatie update" on public.client_medicatie;
create policy "medicatie update" on public.client_medicatie for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
drop policy if exists "medicatie delete" on public.client_medicatie;
create policy "medicatie delete" on public.client_medicatie for delete to authenticated using (public.is_office_staff());

-- aftekeningen: lezen = elke auth; directe write = office. De werkvloer tekent
-- af via de RPC `medicatie_afteken` (SECURITY DEFINER) -> geen brede write nodig.
drop policy if exists "cma select" on public.client_medicatie_aftekening;
create policy "cma select" on public.client_medicatie_aftekening for select to authenticated using (true);
drop policy if exists "cma insert" on public.client_medicatie_aftekening;
create policy "cma insert" on public.client_medicatie_aftekening for insert to authenticated with check (public.is_office_staff());
drop policy if exists "cma update" on public.client_medicatie_aftekening;
create policy "cma update" on public.client_medicatie_aftekening for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
drop policy if exists "cma delete" on public.client_medicatie_aftekening;
create policy "cma delete" on public.client_medicatie_aftekening for delete to authenticated using (public.is_office_staff());

-- 5. RPC: aftekenen door de (floor-)medewerker -------------------------------
-- Bepaalt de medewerker uit auth.uid() en upsert de aftekening voor
-- (medicatie, datum, dagdeel). Een eerdere 'gemist'-rij wordt naar 'gegeven'
-- bijgewerkt (te laat afgetekend) maar de incident-koppeling blijft bewaard.
create or replace function public.medicatie_afteken(
  p_medicatie_id uuid,
  p_datum        date,
  p_dagdeel      text,
  p_status       text default 'gegeven',
  p_reden        text default null,
  p_notitie      text default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_mid    uuid;
  v_naam   text;
  v_client text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'Niet ingelogd'; end if;
  if p_dagdeel not in ('ochtend','middag','avond') then raise exception 'Ongeldig dagdeel: %', p_dagdeel; end if;
  if p_status  not in ('gegeven','niet_gegeven')    then raise exception 'Ongeldige status: %', p_status; end if;

  select cm.client_id into v_client
    from client_medicatie cm
   where cm.id = p_medicatie_id and cm.archived = false;
  if v_client is null then raise exception 'Medicatie niet gevonden'; end if;

  select p.medewerker_id,
         nullif(btrim(coalesce(mw.voornaam,'') || ' ' || coalesce(mw.achternaam,'')), '')
    into v_mid, v_naam
    from profiles p
    left join medewerkers mw on mw.id = p.medewerker_id
   where p.id = v_uid;
  if v_naam is null then
    select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
      into v_naam from profiles where id = v_uid;
  end if;

  insert into client_medicatie_aftekening
    (medicatie_id, client_id, datum, dagdeel, status, medewerker_id, afgetekend_door, afgetekend_op, reden, notitie)
  values
    (p_medicatie_id, v_client, p_datum, p_dagdeel, p_status, v_mid, v_naam, now(), p_reden, p_notitie)
  on conflict (medicatie_id, datum, dagdeel) do update
    set status          = excluded.status,
        medewerker_id   = excluded.medewerker_id,
        afgetekend_door = excluded.afgetekend_door,
        afgetekend_op   = excluded.afgetekend_op,
        reden           = excluded.reden,
        notitie         = coalesce(excluded.notitie, client_medicatie_aftekening.notitie),
        laatst_gewijzigd = now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.medicatie_afteken(uuid, date, text, text, text, text) from public, anon;
grant execute on function public.medicatie_afteken(uuid, date, text, text, text, text) to authenticated;

-- 6. Cron-functie: herinneringen + auto-incidenten per dagdeel ---------------
-- Draait elk uur. Dagdeel-grenzen (NL-wandklok):
--   ochtend  06:00-12:00  -> incident bij niet-aftekenen vanaf 12:00 (zelfde dag)
--   middag   12:00-18:00  -> incident vanaf 18:00 (zelfde dag)
--   avond    18:00-24:00  -> incident de volgende ochtend vanaf 06:00
create or replace function public.medicatie_dagdeel_run(p_dry_run boolean default false)
returns table(reminders_sent integer, incidents_created integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_now       timestamptz := now();
  v_today     date        := (v_now at time zone 'Europe/Amsterdam')::date;
  v_reminders integer := 0;
  v_incidents integer := 0;
  med         record;
  rcpt        record;
  v_dagdeel   text;
  v_datum     date;
  v_rstart    timestamptz;
  v_rend      timestamptz;
  v_close     timestamptz;
  v_afid      uuid;
  v_incid     uuid;
  v_tijdstip  text;
  v_rel       text;
begin
  -- ===== A. AFTEKEN-HERINNERINGEN (tijdens het lopende dagdeel van vandaag) =====
  for med in
    select cm.id, cm.client_id, cm.naam, cm.dosering, cm.dagdelen, cm.weekdagen,
           cm.startdatum, cm.einddatum, cm.aanmaakdatum,
           nullif(btrim(coalesce(cl.voornaam,'') || ' ' || coalesce(cl.achternaam,'')), '') as client_naam
      from client_medicatie cm
      join clienten cl on cl.id = cm.client_id
     where cm.archived = false and cm.actief = true and cm.aftekenen = true
  loop
    if med.client_naam is null then continue; end if;
    foreach v_dagdeel in array med.dagdelen loop
      if v_dagdeel not in ('ochtend','middag','avond') then continue; end if;

      v_rstart := ((v_today + (case v_dagdeel when 'ochtend' then time '06:00'
                                              when 'middag'  then time '12:00'
                                              else time '18:00' end)) at time zone 'Europe/Amsterdam');
      v_rend   := ((v_today + (case v_dagdeel when 'ochtend' then time '12:00'
                                              when 'middag'  then time '18:00'
                                              else time '23:59:59' end)) at time zone 'Europe/Amsterdam');
      if v_now < v_rstart or v_now >= v_rend then continue; end if;
      if not (extract(isodow from v_today)::int = any(med.weekdagen)) then continue; end if;
      if v_today < coalesce(med.startdatum, (med.aanmaakdatum at time zone 'Europe/Amsterdam')::date) then continue; end if;
      if med.einddatum is not null and v_today > med.einddatum then continue; end if;
      -- al afgetekend (gegeven/niet_gegeven)? dan geen herinnering meer.
      if exists (select 1 from client_medicatie_aftekening a
                  where a.medicatie_id = med.id and a.datum = v_today and a.dagdeel = v_dagdeel
                    and a.status in ('gegeven','niet_gegeven')) then
        continue;
      end if;

      v_rel := med.id::text || ':' || v_today::text || ':' || v_dagdeel;
      for rcpt in
        select distinct p.id as user_id
          from planning pl
          join medewerkers mw on lower(btrim(coalesce(mw.voornaam,'') || ' ' || coalesce(mw.achternaam,''))) = lower(btrim(pl.teamlid)) and mw.archived = false
          join profiles p on p.medewerker_id = mw.id and p.archived = false
         where pl.archived = false and pl.teamlid is not null
           and lower(btrim(pl.client)) = lower(btrim(med.client_naam))
           and (pl.start_iso at time zone 'UTC')::date = v_today
      loop
        if exists (select 1 from notifications n
                    where n.user_id = rcpt.user_id
                      and n.type = 'medicatie_afteken_herinnering'
                      and n.related_entity_id = v_rel) then
          continue;
        end if;
        if not p_dry_run then
          insert into notifications (user_id, type, title, body, related_entity_type, related_entity_id)
          values (rcpt.user_id, 'medicatie_afteken_herinnering',
                  'Medicatie aftekenen: ' || med.client_naam || ' (' || v_dagdeel || ')',
                  'Teken af of ' || med.naam || coalesce(' ' || nullif(med.dosering,''), '') ||
                    ' in de ' || v_dagdeel || ' is gegeven aan ' || med.client_naam || '.',
                  'medicatie', v_rel);
        end if;
        v_reminders := v_reminders + 1;
      end loop;
    end loop;
  end loop;

  -- ===== B. AUTO-INCIDENTEN (gesloten dagdeel-vensters zonder aftekening) =====
  for med in
    select cm.id, cm.client_id, cm.naam, cm.dosering, cm.dagdelen, cm.weekdagen,
           cm.startdatum, cm.einddatum, cm.aanmaakdatum,
           nullif(btrim(coalesce(cl.voornaam,'') || ' ' || coalesce(cl.achternaam,'')), '') as client_naam
      from client_medicatie cm
      join clienten cl on cl.id = cm.client_id
     where cm.archived = false and cm.actief = true and cm.aftekenen = true
  loop
    if med.client_naam is null then continue; end if;
    foreach v_dagdeel in array med.dagdelen loop
      if v_dagdeel not in ('ochtend','middag','avond') then continue; end if;
      foreach v_datum in array array[v_today, v_today - 1, v_today - 2] loop
        v_close := (case v_dagdeel
                     when 'ochtend' then ((v_datum + time '12:00') at time zone 'Europe/Amsterdam')
                     when 'middag'  then ((v_datum + time '18:00') at time zone 'Europe/Amsterdam')
                     else (((v_datum + 1) + time '06:00') at time zone 'Europe/Amsterdam')
                    end);
        -- alleen recent gesloten vensters; nooit een venster dat sloot vóór de
        -- medicatie was vastgelegd (geen retroactieve incidenten).
        if v_close > v_now or v_close <= v_now - interval '40 hours' then continue; end if;
        if v_close <= med.aanmaakdatum then continue; end if;
        if not (extract(isodow from v_datum)::int = any(med.weekdagen)) then continue; end if;
        if v_datum < coalesce(med.startdatum, (med.aanmaakdatum at time zone 'Europe/Amsterdam')::date) then continue; end if;
        if med.einddatum is not null and v_datum > med.einddatum then continue; end if;

        if p_dry_run then
          if not exists (select 1 from client_medicatie_aftekening a
                          where a.medicatie_id = med.id and a.datum = v_datum and a.dagdeel = v_dagdeel) then
            v_incidents := v_incidents + 1;
          end if;
          continue;
        end if;

        -- claim de 'gemist'-rij (uniek -> idempotent + race-safe). Bestaat er al
        -- een rij (gegeven/niet_gegeven/gemist), dan geen incident.
        insert into client_medicatie_aftekening (medicatie_id, client_id, datum, dagdeel, status)
        values (med.id, med.client_id, v_datum, v_dagdeel, 'gemist')
        on conflict (medicatie_id, datum, dagdeel) do nothing
        returning id into v_afid;
        if v_afid is null then continue; end if;

        v_tijdstip := case v_dagdeel when 'ochtend' then 'morning' when 'middag' then 'midday' else 'evening' end;
        insert into incidenten (
          client_id, categorie, status, melder_id, locatie_id, incident_datum,
          omschrijving, genomen_maatregelen, tijdstip_van_dag, is_buiten, actor_type,
          betrokken_partijen, ouders_geinformeerd, ouders_niet_reden, wil_gebeld_worden,
          impact_op_zorgverlener, notificeer_team, notificeer_medewerker_ids, data
        ) values (
          med.client_id, 'Medicatie', 'in_afwachting', null, null, v_close,
          'Medicatie ' || med.naam || coalesce(' (' || nullif(med.dosering,'') || ')', '') ||
            ' is in de ' || v_dagdeel || ' van ' || to_char(v_datum,'DD-MM-YYYY') ||
            ' niet afgetekend voor ' || med.client_naam ||
            '. Automatisch gegenereerd omdat er geen aftekenmoment was.',
          '', v_tijdstip, false, 'alleen_client',
          '[]'::jsonb, null, null, false,
          '', false, '{}'::uuid[],
          jsonb_build_object('source','auto_medicatie','medicatie_id',med.id,'dagdeel',v_dagdeel,'datum',v_datum)
        ) returning id into v_incid;

        update client_medicatie_aftekening set incident_id = v_incid where id = v_afid;
        v_incidents := v_incidents + 1;

        -- meld aan de medewerker(s) op de planning + kantoor/zorgcoördinatie
        for rcpt in
          select distinct p.id as user_id
            from planning pl
            join medewerkers mw on lower(btrim(coalesce(mw.voornaam,'') || ' ' || coalesce(mw.achternaam,''))) = lower(btrim(pl.teamlid)) and mw.archived = false
            join profiles p on p.medewerker_id = mw.id and p.archived = false
           where pl.archived = false and pl.teamlid is not null
             and lower(btrim(pl.client)) = lower(btrim(med.client_naam))
             and (pl.start_iso at time zone 'UTC')::date = v_datum
          union
          select uid from ff_planner_hr_user_ids() as uid
        loop
          insert into notifications (user_id, type, title, body, related_entity_type, related_entity_id)
          values (rcpt.user_id, 'medicatie_incident',
                  'Incident: medicatie niet afgetekend',
                  'Medicatie ' || med.naam || ' (' || v_dagdeel || ') is op ' ||
                    to_char(v_datum,'DD-MM-YYYY') || ' niet afgetekend voor ' || med.client_naam ||
                    '. Er is automatisch een incident aangemaakt.',
                  'incidenten', v_incid::text);
        end loop;
      end loop;
    end loop;
  end loop;

  return query select v_reminders, v_incidents;
end;
$function$;

revoke all on function public.medicatie_dagdeel_run(boolean) from public, anon, authenticated;
grant execute on function public.medicatie_dagdeel_run(boolean) to service_role;

-- 7. pg_cron: elk uur ---------------------------------------------------------
select cron.schedule('medicatie-dagdeel-run', '0 * * * *', $cron$ select public.medicatie_dagdeel_run(false); $cron$);
