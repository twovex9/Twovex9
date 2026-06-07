-- ============================================================================
-- Automatische kilometervergoeding woon -> werk
-- ============================================================================
-- Feature (Lionel/HR, 2026-06-01): bereken per dienstdag automatisch de
-- woon-werk kilometers (heen + terug) voor LOONDIENST-medewerkers op basis van
-- hun woonadres (HR) en de werklocatie van die dag. Op de 1e van de nieuwe
-- maand worden alle dienstdagen van de vorige maand uitgerekend; de medewerker
-- keurt het overzicht goed (indienen) -> salarisadministratie.
--
-- Dit bestand documenteert de DB-objecten. De tabel hieronder is al via
-- `apply_migration` (km_afstanden_matrix) toegepast; hier staat-ie idempotent
-- zodat een verse deploy 'm ook krijgt. De generatie-functie + pg_cron volgen
-- in een vervolg (PR2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PR1 — Woon-werk afstandsmatrix (medewerker x locatie, enkele reis in km)
-- ----------------------------------------------------------------------------
-- bron='auto'      -> berekend via geo-distance.js (PDOK geocode + OSRM route)
-- bron='handmatig' -> HR-correctie; wordt NOOIT door een auto-herberekening
--                     overschreven (zie kmAfstandenDB.upsert + recalcBatch).
create table if not exists public.medewerker_locatie_afstanden (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  locatie_id uuid not null references public.locaties(id) on delete cascade,
  km_enkel numeric,
  bron text not null default 'auto',
  laatst_berekend timestamptz,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  unique (medewerker_id, locatie_id)
);

create index if not exists mla_medewerker_idx on public.medewerker_locatie_afstanden (medewerker_id);
create index if not exists mla_locatie_idx on public.medewerker_locatie_afstanden (locatie_id);

drop trigger if exists trg_mla_set_modified on public.medewerker_locatie_afstanden;
create trigger trg_mla_set_modified
  before update on public.medewerker_locatie_afstanden
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerker_locatie_afstanden enable row level security;

drop policy if exists "auth kan mla lezen" on public.medewerker_locatie_afstanden;
create policy "auth kan mla lezen"
  on public.medewerker_locatie_afstanden for select to authenticated using (true);

drop policy if exists "auth kan mla toevoegen" on public.medewerker_locatie_afstanden;
create policy "auth kan mla toevoegen"
  on public.medewerker_locatie_afstanden for insert to authenticated with check (true);

drop policy if exists "auth kan mla bewerken" on public.medewerker_locatie_afstanden;
create policy "auth kan mla bewerken"
  on public.medewerker_locatie_afstanden for update to authenticated using (true) with check (true);

drop policy if exists "auth kan mla verwijderen" on public.medewerker_locatie_afstanden;
create policy "auth kan mla verwijderen"
  on public.medewerker_locatie_afstanden for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- PR2 — Auto-generatie van de woon-werk km voor de vorige maand
-- ----------------------------------------------------------------------------
-- Draait op de 1e van elke maand (pg_cron) en rekent voor elke LOONDIENST-
-- medewerker de dienstdagen van de zojuist afgelopen maand uit:
--   * planning.teamlid = voornaam || ' ' || achternaam (zelfde naam-match als
--     de bestaande getDistanceForDay in kilometers.js; geen FK op planning).
--   * per kalenderdag (NL-tijd) telt 1 retour naar de locatie van de eerste
--     dienst die dag -> 2 records (heen + terug), elk de ENKELE reis uit de
--     matrix. Zo klopt de bestaande cap-per-rit (100 km) vanzelf: 70 + 70 =
--     140 km = EUR 54,60 (heen en terug zijn twee ritten).
--
-- VEILIG / IDEMPOTENT (DIEHARD): voegt alleen toe, verwijdert/overschrijft
-- NOOIT bestaande records. Een dag met al een record wordt overgeslagen; een
-- ingediende/vergrendelde declaratie wordt niet aangeraakt. 2x draaien op de
-- 1e doet niets dubbel. p_dry_run=true schrijft niets (telt alleen).
--
-- Ontbrekende afstand/locatie -> dag wordt overgeslagen (geen foute km); het
-- aantal komt terug in de summary. Het HR-signaal hierover volgt in PR3.
--
-- pg_net: shared-secret in private_app_config (km_push_cron_secret); de Edge
-- Function `km-declaratie-push` (verify_jwt=false) stuurt de telefoon-push.
-- ----------------------------------------------------------------------------

create extension if not exists pg_net;

insert into public.private_app_config (sleutel, waarde)
select 'km_push_cron_secret', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.private_app_config where sleutel = 'km_push_cron_secret');

create or replace function public.km_genereer_vorige_maand(p_dry_run boolean default false)
returns table (
  medewerkers_verwerkt   integer,
  dagen_gevonden         integer,
  records_aangemaakt     integer,
  declaraties_aangemaakt integer,
  dagen_zonder_afstand   integer,
  meldingen_verstuurd    integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_nl         date        := (v_now at time zone 'Europe/Amsterdam')::date;
  v_this_start date        := date_trunc('month', v_nl)::date;     -- 1e van deze maand
  v_prev_start date        := (v_this_start - interval '1 month')::date;
  v_prev_end   date        := (v_this_start - interval '1 day')::date;
  v_year       integer     := extract(year  from v_prev_start)::int;
  v_month      integer     := extract(month from v_prev_start)::int;
  v_deadline   date        := (v_this_start + interval '9 days')::date; -- 10e van deze maand
  v_dl_passed  boolean     := v_nl > v_deadline;
  v_rate       numeric     := 0.39;
  v_cap        numeric     := 100;
  v_maand_nl   text        := (array['januari','februari','maart','april','mei','juni',
                                     'juli','augustus','september','oktober','november','december'])[v_month];

  r_mw     record;
  r_day    record;
  v_admin  record;
  v_decl_id      text;
  v_decl_status  text;
  v_loc_id       uuid;
  v_km           numeric;
  v_user_id      uuid;
  v_notif_id     uuid;
  v_notif_ids    uuid[] := '{}';
  v_secret       text;
  v_url          text := 'https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/km-declaratie-push';

  c_mw     integer := 0;
  c_day    integer := 0;
  c_rec    integer := 0;
  c_decl   integer := 0;
  c_nodist integer := 0;
  c_notif  integer := 0;
begin
  for r_mw in
    select mw.id, mw.voornaam, mw.achternaam
    from public.medewerkers mw
    where mw.archived = false
      and lower(coalesce(mw.dienstverband, '')) in ('loondienst', 'permanent', 'vast')
  loop
    c_mw := c_mw + 1;

    -- Bestaande declaratie voor mw x periode?
    select id, status into v_decl_id, v_decl_status
    from public.kilometer_declaraties
    where medewerker_id = r_mw.id and jaar = v_year and maand = v_month
    limit 1;

    -- Ingediend/vergrendeld -> nooit aanraken.
    if v_decl_status in ('submitted', 'locked') then
      continue;
    end if;

    -- Per dienstdag: locatie van de eerste dienst die dag.
    for r_day in
      select distinct on (d.dag) d.dag, d.locatie
      from (
        select (p.start_iso at time zone 'Europe/Amsterdam')::date as dag,
               coalesce(nullif(btrim(p.locatie), ''), nullif(btrim(p.vestiging), '')) as locatie,
               p.start_iso
        from public.planning p
        where p.archived = false
          and lower(btrim(coalesce(p.teamlid, ''))) = lower(btrim(r_mw.voornaam || ' ' || r_mw.achternaam))
          and (p.start_iso at time zone 'Europe/Amsterdam')::date between v_prev_start and v_prev_end
      ) d
      order by d.dag, d.start_iso
    loop
      c_day := c_day + 1;

      -- Locatie -> enkele-reis-afstand uit de matrix.
      v_loc_id := null; v_km := null;
      if r_day.locatie is not null then
        select loc.id, mla.km_enkel into v_loc_id, v_km
        from public.locaties loc
        left join public.medewerker_locatie_afstanden mla
          on mla.locatie_id = loc.id and mla.medewerker_id = r_mw.id
        where loc.archived = false
          and lower(btrim(loc.naam)) = lower(btrim(r_day.locatie))
        limit 1;
      end if;

      if v_km is null then
        c_nodist := c_nodist + 1;   -- geen foute km; HR-signaal in PR3
        continue;
      end if;

      -- Lazy ensureDraft: declaratie pas aanmaken als er echt een record komt.
      if v_decl_id is null then
        v_decl_id := 'kmd-' || gen_random_uuid()::text;
        if not p_dry_run then
          insert into public.kilometer_declaraties
            (id, medewerker_id, jaar, maand, status, total_kilometers, total_reimbursement,
             is_editable, can_be_submitted, is_deadline_passed, submission_status, data,
             aanmaakdatum, laatst_gewijzigd)
          values
            (v_decl_id, r_mw.id, v_year, v_month, 'draft', 0, 0,
             not v_dl_passed, not v_dl_passed, v_dl_passed,
             jsonb_build_object('status', 'draft',
               'message', case when v_dl_passed then 'Vergrendeld (deadline verstreken)' else 'Nog niet ingediend' end,
               'color',   case when v_dl_passed then 'red' else 'yellow' end,
               'icon',    case when v_dl_passed then 'lock' else 'warning' end),
             '{}'::jsonb, v_now, v_now);
        end if;
        c_decl := c_decl + 1;
      end if;

      -- Idempotent: al een record op deze datum? -> dag overslaan (nooit dubbel).
      if not p_dry_run and exists (
        select 1 from public.kilometer_records
        where declaratie_id = v_decl_id and datum = r_day.dag
      ) then
        continue;
      end if;

      -- 2 records: heen + terug, elk de enkele reis (cap-per-rit klopt dan vanzelf).
      if not p_dry_run then
        insert into public.kilometer_records
          (id, declaratie_id, datum, beschrijving, kilometers, type, type_display,
           is_automatic, locatie_naam, data, aanmaakdatum, laatst_gewijzigd)
        values
          ('kmr-' || gen_random_uuid()::text, v_decl_id, r_day.dag,
           'Woon-werk ' || r_day.locatie || ' (heen, automatisch)', v_km, 'office', 'Naar kantoor',
           true, r_day.locatie, '{}'::jsonb, v_now, v_now),
          ('kmr-' || gen_random_uuid()::text, v_decl_id, r_day.dag,
           'Woon-werk ' || r_day.locatie || ' (terug, automatisch)', v_km, 'office', 'Naar kantoor',
           true, r_day.locatie, '{}'::jsonb, v_now, v_now);
      end if;
      c_rec := c_rec + 2;
    end loop;

    -- Totalen + medewerker-notificatie (alleen als er een declaratie met records is).
    if v_decl_id is not null and not p_dry_run then
      update public.kilometer_declaraties d
      set total_kilometers    = sub.km,
          total_reimbursement = sub.eur,
          laatst_gewijzigd    = v_now
      from (
        select coalesce(sum(kilometers), 0) as km,
               coalesce(sum(least(kilometers, v_cap) * v_rate), 0) as eur
        from public.kilometer_records where declaratie_id = v_decl_id
      ) sub
      where d.id = v_decl_id and d.status not in ('submitted', 'locked');

      -- Ontvanger = de gekoppelde gebruiker (profiles.medewerker_id).
      select p.id into v_user_id from public.profiles p where p.medewerker_id = r_mw.id limit 1;

      if v_user_id is not null and exists (
        select 1 from public.kilometer_records where declaratie_id = v_decl_id
      ) and not exists (
        -- Idempotent: niet nogmaals melden voor deze declaratie.
        select 1 from public.notifications n
        where n.user_id = v_user_id
          and n.type = 'km_declaratie_klaar'
          and n.related_entity_id = v_decl_id
      ) then
        insert into public.notifications
          (user_id, type, title, body, related_entity_type, related_entity_id)
        values
          (v_user_id, 'km_declaratie_klaar',
           'Kilometerdeclaratie ' || v_maand_nl || ' staat klaar',
           'Je woon-werk kilometers van ' || v_maand_nl || ' ' || v_year ||
           ' zijn automatisch berekend. Controleer en keur ze goed (indienen) op de Kilometers-pagina.',
           'kilometer_declaraties', v_decl_id)
        returning id into v_notif_id;
        v_notif_ids := array_append(v_notif_ids, v_notif_id);
        c_notif := c_notif + 1;
      end if;
    end if;

    v_decl_id := null; v_decl_status := null;  -- reset voor volgende medewerker
  end loop;

  -- HR-signaal: dagen die niet automatisch berekend konden worden (locatie/
  -- afstand onbekend). Eén samenvattende melding naar admins, idempotent per maand.
  if not p_dry_run and c_nodist > 0 then
    for v_admin in select id from public.profiles where rol = 'admin' loop
      if not exists (
        select 1 from public.notifications n
        where n.user_id = v_admin.id and n.type = 'km_generatie_signaal'
          and n.related_entity_id = v_year::text || '-' || v_month::text
      ) then
        insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
        values (v_admin.id, 'km_generatie_signaal',
          'Kilometers ' || v_maand_nl || ': ' || c_nodist || ' dag(en) niet berekend',
          c_nodist || ' dienstdag(en) in ' || v_maand_nl || ' ' || v_year ||
          ' konden niet automatisch berekend worden (locatie of woon-werk afstand onbekend). '
          || 'Controleer de Woon-werk afstanden.',
          'km_generatie', v_year::text || '-' || v_month::text);
      end if;
    end loop;
  end if;

  -- Best-effort telefoon-push voor de zojuist aangemaakte meldingen. Mag de
  -- in-app meldingen NOOIT raken -> alles in een exception-block.
  if not p_dry_run and array_length(v_notif_ids, 1) > 0 then
    begin
      select waarde into v_secret from public.private_app_config where sleutel = 'km_push_cron_secret';
      if v_secret is not null and v_secret <> '' then
        perform net.http_post(
          url     := v_url,
          body    := jsonb_build_object('notification_ids', to_jsonb(v_notif_ids)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret)
        );
      end if;
    exception when others then
      null; -- push faalde; in-app meldingen blijven staan, run slaagt.
    end;
  end if;

  return query select c_mw, c_day, c_rec, c_decl, c_nodist, c_notif;
end;
$$;

revoke all on function public.km_genereer_vorige_maand(boolean) from public, anon, authenticated;
grant execute on function public.km_genereer_vorige_maand(boolean) to service_role;

-- pg_cron: 1e van elke maand om 02:30 NL (00:30 UTC). cron.schedule is
-- idempotent. NB: pas activeren wanneer de feature af + geverifieerd is en de
-- afstandsmatrix gevuld is (anders worden dagen massaal overgeslagen).
-- select cron.schedule(
--   'km-genereer-vorige-maand',
--   '30 0 1 * *',
--   $cron$select public.km_genereer_vorige_maand();$cron$
-- );
--
-- Verify:    select * from cron.job where jobname = 'km-genereer-vorige-maand';
-- Dry-run:   select * from public.km_genereer_vorige_maand(true);
-- Stoppen:   select cron.unschedule('km-genereer-vorige-maand');

-- ----------------------------------------------------------------------------
-- PR3 — Afwijkingen: medewerker wijzigt/verwijdert een AUTOMATISCH berekende rit
-- ----------------------------------------------------------------------------
-- De frontend logt de afwijking (oud -> nieuw + reden); een trigger informeert
-- HR (admins) zodat die kan uitzoeken waarom de kilometers verschillen.
create table if not exists public.kilometer_afwijkingen (
  id uuid primary key default gen_random_uuid(),
  record_id text,
  declaratie_id text,
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  datum date,
  locatie text,
  actie text not null default 'gewijzigd',     -- 'gewijzigd' | 'verwijderd'
  km_berekend numeric,
  km_nieuw numeric,
  reden text,
  status text not null default 'open',          -- 'open' | 'afgehandeld'
  behandeld_door uuid references public.profiles(id) on delete set null,
  behandeld_op timestamptz,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists km_afw_status_idx on public.kilometer_afwijkingen (status);
create index if not exists km_afw_mw_idx on public.kilometer_afwijkingen (medewerker_id);
create index if not exists km_afw_datum_idx on public.kilometer_afwijkingen (datum);

drop trigger if exists trg_km_afw_set_modified on public.kilometer_afwijkingen;
create trigger trg_km_afw_set_modified
  before update on public.kilometer_afwijkingen
  for each row execute function public.set_laatst_gewijzigd();

create or replace function public.km_afwijking_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_naam   text;
  v_admin  record;
  v_nieuw  text := case when new.actie = 'verwijderd' then 'verwijderd'
                        else coalesce(new.km_nieuw::text, '?') || ' km' end;
begin
  select coalesce(nullif(btrim(voornaam || ' ' || achternaam), ''), 'Een medewerker')
    into v_naam from public.medewerkers where id = new.medewerker_id;
  for v_admin in select id from public.profiles where rol = 'admin' loop
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (
      v_admin.id, 'km_afwijking',
      'Kilometer-afwijking: ' || v_naam,
      v_naam || ' heeft een automatisch berekende rit ' || new.actie || ' ('
        || to_char(new.datum, 'DD-MM-YYYY') || coalesce(', ' || nullif(new.locatie, ''), '') || '). '
        || 'Berekend: ' || coalesce(new.km_berekend::text, '?') || ' km -> ' || v_nieuw || '. '
        || 'Reden: ' || coalesce(nullif(btrim(new.reden), ''), '(geen opgegeven)'),
      'kilometer_afwijkingen', new.id::text
    );
  end loop;
  return new;
end; $$;

drop trigger if exists trg_km_afw_notify on public.kilometer_afwijkingen;
create trigger trg_km_afw_notify
  after insert on public.kilometer_afwijkingen
  for each row execute function public.km_afwijking_notify();

alter table public.kilometer_afwijkingen enable row level security;

drop policy if exists "auth kan km_afw lezen" on public.kilometer_afwijkingen;
create policy "auth kan km_afw lezen"
  on public.kilometer_afwijkingen for select to authenticated using (true);

drop policy if exists "auth kan km_afw toevoegen" on public.kilometer_afwijkingen;
create policy "auth kan km_afw toevoegen"
  on public.kilometer_afwijkingen for insert to authenticated with check (true);

drop policy if exists "auth kan km_afw bewerken" on public.kilometer_afwijkingen;
create policy "auth kan km_afw bewerken"
  on public.kilometer_afwijkingen for update to authenticated using (true) with check (true);

drop policy if exists "auth kan km_afw verwijderen" on public.kilometer_afwijkingen;
create policy "auth kan km_afw verwijderen"
  on public.kilometer_afwijkingen for delete to authenticated using (true);

