-- ============================================================================
-- Cliëntmodule 2.0 — Fase 1: cliëntreis-fundament + aanmeldportaal + beoordeling
-- Idempotent. Uitrol: node scripts/db-exec.mjs --file supabase/migrations/clientmodule_v2_fase1.sql
-- Zie docs/clientmodule-v2/PLAN.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. clienten.reis_status (13 canonieke statussen, spec §1)
-- ----------------------------------------------------------------------------
alter table public.clienten add column if not exists reis_status text;

-- Backfill VÓÓR triggers (geen tijdlijn-ruis): mapping vanuit legacy fase.
update public.clienten
set reis_status = case lower(coalesce(fase, ''))
  when 'in aanvraag' then 'in_beoordeling'
  when 'uit zorg'    then 'uitgestroomd'
  else 'actief'
end
where reis_status is null;

alter table public.clienten alter column reis_status set default 'actief';
alter table public.clienten alter column reis_status set not null;

do $$ begin
  alter table public.clienten add constraint clienten_reis_status_chk check (reis_status in (
    'nieuwe_aanmelding','in_beoordeling','meer_info_nodig','intake_gepland','intake_afgerond',
    'wachtlijst','plaatsing_gepland','actief','tijdelijk_gepauzeerd','uitstroom_gepland',
    'uitgestroomd','nazorg','dossier_gesloten'));
exception when duplicate_object then null; end $$;

create index if not exists clienten_reis_status_idx on public.clienten (reis_status);

-- Label-helper (ook gebruikt voor tijdlijn-teksten)
create or replace function public.clientreis_status_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'nieuwe_aanmelding'    then 'Nieuwe aanmelding'
    when 'in_beoordeling'       then 'In beoordeling'
    when 'meer_info_nodig'      then 'Meer informatie nodig'
    when 'intake_gepland'       then 'Intake gepland'
    when 'intake_afgerond'      then 'Intake afgerond'
    when 'wachtlijst'           then 'Wachtlijst'
    when 'plaatsing_gepland'    then 'Plaatsing gepland'
    when 'actief'               then 'Actief'
    when 'tijdelijk_gepauzeerd' then 'Tijdelijk gepauzeerd'
    when 'uitstroom_gepland'    then 'Uitstroom gepland'
    when 'uitgestroomd'         then 'Uitgestroomd'
    when 'nazorg'               then 'Nazorg'
    when 'dossier_gesloten'     then 'Dossier gesloten'
    else coalesce(p_status, '—')
  end;
$$;

-- Bidirectionele sync reis_status ↔ legacy fase. Legacy fase-casing wordt
-- alleen herschreven als de fase-GROEP wijzigt (DIEHARD: casing niet normaliseren).
create or replace function public.clientreis_fase_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_fase_doel text;
begin
  if tg_op = 'INSERT' then
    if new.reis_status is null or new.reis_status = '' then
      new.reis_status := case lower(coalesce(new.fase, ''))
        when 'in aanvraag' then 'in_beoordeling'
        when 'uit zorg'    then 'uitgestroomd'
        else 'actief' end;
    end if;
  elsif new.reis_status is not distinct from old.reis_status
        and lower(coalesce(new.fase, '')) is distinct from lower(coalesce(old.fase, '')) then
    -- legacy UI wijzigde fase → reis_status volgen
    new.reis_status := case lower(coalesce(new.fase, ''))
      when 'in aanvraag' then 'in_beoordeling'
      when 'uit zorg'    then 'uitgestroomd'
      else 'actief' end;
    return new;
  end if;

  -- reis_status is leidend → fase-groep spiegelen
  v_fase_doel := case new.reis_status
    when 'actief'               then 'in zorg'
    when 'tijdelijk_gepauzeerd' then 'in zorg'
    when 'uitstroom_gepland'    then 'in zorg'
    when 'uitgestroomd'         then 'uit zorg'
    when 'nazorg'               then 'uit zorg'
    when 'dossier_gesloten'     then 'uit zorg'
    else 'in aanvraag' end;
  if lower(coalesce(new.fase, '')) <> v_fase_doel then
    new.fase := v_fase_doel;
  end if;
  return new;
end; $$;

drop trigger if exists trg_clientreis_fase_sync on public.clienten;
create trigger trg_clientreis_fase_sync
  before insert or update on public.clienten
  for each row execute function public.clientreis_fase_sync();

-- ----------------------------------------------------------------------------
-- 2. client_tijdlijn (spec §1 + §15)
-- ----------------------------------------------------------------------------
create table if not exists public.client_tijdlijn (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  event_type text not null default 'overig',
  titel text not null,
  omschrijving text,
  bron_tabel text,
  bron_id text,
  created_by uuid,
  created_by_naam text,
  created_at timestamptz not null default now()
);
create index if not exists client_tijdlijn_client_idx on public.client_tijdlijn (client_id, created_at desc);

alter table public.client_tijdlijn enable row level security;

-- Lezen mag wie de cliënt mag zien (clienten-RLS geldt in de subquery).
do $$ begin
  create policy client_tijdlijn_select on public.client_tijdlijn
    for select to authenticated
    using (exists (select 1 from public.clienten c where c.id = client_tijdlijn.client_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy bureau_lockout on public.client_tijdlijn
    as restrictive for all to authenticated
    using (not is_bureau_only_user()) with check (not is_bureau_only_user());
exception when duplicate_object then null; end $$;
-- Geen insert/update/delete-policies: schrijven kan alleen via definer-functies/triggers.

-- Interne writer (SECURITY DEFINER zodat triggers/RPC's altijd kunnen loggen)
create or replace function public.client_tijdlijn_log(
  p_client_id text, p_event_type text, p_titel text,
  p_omschrijving text default null, p_bron_tabel text default null, p_bron_id text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_naam text;
begin
  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
    into v_naam from public.profiles where id = auth.uid();
  insert into public.client_tijdlijn (client_id, event_type, titel, omschrijving, bron_tabel, bron_id, created_by, created_by_naam)
  values (p_client_id, p_event_type, p_titel, p_omschrijving, p_bron_tabel, p_bron_id, auth.uid(), coalesce(v_naam, 'Systeem'));
end; $$;
revoke all on function public.client_tijdlijn_log(text, text, text, text, text, text) from public, anon, authenticated;

-- Statuswijziging + dossier-aanmaak → tijdlijn
create or replace function public.trg_clientreis_tijdlijn()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform public.client_tijdlijn_log(new.id, 'status_wijziging',
      'Dossier aangemaakt — ' || public.clientreis_status_label(new.reis_status), null, 'clienten', new.id);
  elsif new.reis_status is distinct from old.reis_status then
    perform public.client_tijdlijn_log(new.id, 'status_wijziging',
      'Status gewijzigd: ' || public.clientreis_status_label(old.reis_status) || ' → ' || public.clientreis_status_label(new.reis_status),
      null, 'clienten', new.id);
  end if;
  return new;
end; $$;

drop trigger if exists trg_clientreis_tijdlijn on public.clienten;
create trigger trg_clientreis_tijdlijn
  after insert or update on public.clienten
  for each row execute function public.trg_clientreis_tijdlijn();

-- ----------------------------------------------------------------------------
-- 3. client_contacten — uitbreiding (spec §2 ouders/gezaghebbenden/voogd + verwijzer)
-- ----------------------------------------------------------------------------
alter table public.client_contacten add column if not exists gezaghebbend boolean not null default false;
alter table public.client_contacten add column if not exists adres text;
alter table public.client_contacten add column if not exists organisatie text;
alter table public.client_contacten add column if not exists functie text;
alter table public.client_contacten add column if not exists contact_rol text; -- ouder|voogd|gezaghebbende|verwijzer|overig

-- ----------------------------------------------------------------------------
-- 4. client_aanmeldingen + rate-limits (spec §2)
-- ----------------------------------------------------------------------------
create sequence if not exists public.aanmelding_ref_seq;

create table if not exists public.client_aanmeldingen (
  id uuid primary key default gen_random_uuid(),
  referentie text not null unique,
  client_id text,
  status text not null default 'nieuw' check (status in ('nieuw','in_beoordeling','meer_info_nodig','goedgekeurd','afgewezen','wachtlijst')),
  -- cliëntgegevens
  voornaam text not null,
  achternaam text not null,
  bsn text,
  geboortedatum date,
  geslacht text,
  adres text,
  postcode text,
  woonplaats text,
  gemeente text,
  nationaliteit text,
  -- verwijzer
  verwijzer_organisatie text,
  verwijzer_naam text,
  verwijzer_functie text,
  verwijzer_telefoon text,
  verwijzer_email text,
  -- aanmeldinformatie
  reden_aanmelding text,
  hulpvraag text,
  urgentie text check (urgentie in ('laag','middel','hoog','spoed') or urgentie is null),
  veiligheidsrisicos text,
  diagnoses text,
  huidige_hulpverlening text,
  school_dagbesteding text,
  gewenste_zorgvorm text,
  gewenste_startdatum date,
  -- contactpersonen + uploads (jsonb-snapshot; contacten ook als client_contacten-rijen)
  contactpersonen jsonb not null default '[]'::jsonb,
  documenten jsonb not null default '[]'::jsonb,
  -- beoordeling
  beoordeeld_door uuid,
  beoordeeld_door_naam text,
  beoordeeld_op timestamptz,
  beoordeling_toelichting text,
  meer_info_verzoek text,
  wachtlijst_reden text,
  -- meta
  ip_hash text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
create index if not exists client_aanmeldingen_status_idx on public.client_aanmeldingen (status, aanmaakdatum desc);
create index if not exists client_aanmeldingen_client_idx on public.client_aanmeldingen (client_id);

create table if not exists public.aanmeld_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists aanmeld_rate_limits_idx on public.aanmeld_rate_limits (ip_hash, created_at desc);

alter table public.client_aanmeldingen enable row level security;
alter table public.aanmeld_rate_limits enable row level security;

-- Rol-check helper: beoordelaars = GW / Zorgcoördinator (slug teamleider) / Directeur (+ Admin/Eigenaar)
create or replace function public.clientreis_kan_beoordelen()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (
      p.rol = 'admin'
      or exists (
        select 1 from public.bs2_role_users u
        join public.bs2_roles r on r.id = u.role_id
        where lower(u.user_email) = lower(p.email)
          and r.slug in ('admin','eigenaar','directeur','teamleider','gedragswetenschapper')
      )
    )
  );
$$;

do $$ begin
  create policy client_aanmeldingen_select on public.client_aanmeldingen
    for select to authenticated using (public.clientreis_kan_beoordelen());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy bureau_lockout on public.client_aanmeldingen
    as restrictive for all to authenticated
    using (not is_bureau_only_user()) with check (not is_bureau_only_user());
exception when duplicate_object then null; end $$;
-- Geen insert/update/delete-policies: indienen via service-role (edge function), beslissen via RPC.

-- Audit-trigger (zelfde patroon als trg_audit_clienten)
create or replace function public.trg_audit_client_aanmeldingen()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_label text;
begin
  v_label := coalesce(nullif(btrim(coalesce(new.voornaam,'') || ' ' || coalesce(new.achternaam,'')), ''), new.referentie);
  if tg_op = 'INSERT' then
    perform public.log_audit_event('Aanmelding', new.id::text, 'aanmaken', v_label);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.log_audit_event('Aanmelding', new.id::text, 'bewerken', v_label || ' — status: ' || old.status || ' → ' || new.status);
  end if;
  return new;
end; $$;

drop trigger if exists trg_audit_client_aanmeldingen on public.client_aanmeldingen;
create trigger trg_audit_client_aanmeldingen
  after insert or update on public.client_aanmeldingen
  for each row execute function public.trg_audit_client_aanmeldingen();

-- laatst_gewijzigd bijhouden
create or replace function public.client_aanmeldingen_set_lg()
returns trigger language plpgsql as $$
begin new.laatst_gewijzigd := now(); return new; end; $$;
drop trigger if exists trg_client_aanmeldingen_lg on public.client_aanmeldingen;
create trigger trg_client_aanmeldingen_lg
  before update on public.client_aanmeldingen
  for each row execute function public.client_aanmeldingen_set_lg();

-- ----------------------------------------------------------------------------
-- 5. Notificatie-helper: meld beoordelaars (directeur/zorgcoördinator/GW)
-- ----------------------------------------------------------------------------
create or replace function public.clientreis_notificeer_beoordelaars(
  p_type text, p_titel text, p_body text, p_entity_type text, p_entity_id text, p_skip_user uuid default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare rec record; v_count int := 0;
begin
  for rec in
    select distinct p.id as user_id
    from public.profiles p
    join public.bs2_role_users u on lower(u.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = u.role_id
    where coalesce(p.archived, false) = false
      and r.slug in ('directeur','teamleider','gedragswetenschapper')
      and (p_skip_user is null or p.id <> p_skip_user)
  loop
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (rec.user_id, p_type, p_titel, p_body, p_entity_type, p_entity_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
revoke all on function public.clientreis_notificeer_beoordelaars(text, text, text, text, text, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: aanmelding indienen (ALLEEN service-role; aangeroepen door edge function)
-- ----------------------------------------------------------------------------
create or replace function public.aanmelding_dien_in(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_ip text := coalesce(p->>'ip_hash', '');
  v_recent int;
  v_ref text;
  v_client_id text;
  v_aanmelding_id uuid;
  v_naam text;
  v_contact jsonb;
begin
  -- rate-limit: max 5 aanmeldingen per IP per uur
  if v_ip <> '' then
    select count(*) into v_recent from public.aanmeld_rate_limits
    where ip_hash = v_ip and created_at > now() - interval '1 hour';
    if v_recent >= 5 then
      return jsonb_build_object('ok', false, 'fout', 'rate_limit');
    end if;
    insert into public.aanmeld_rate_limits (ip_hash) values (v_ip);
  end if;

  -- minimale validatie (frontend valideert ook)
  if nullif(btrim(p->>'voornaam'), '') is null or nullif(btrim(p->>'achternaam'), '') is null then
    return jsonb_build_object('ok', false, 'fout', 'naam_verplicht');
  end if;

  v_ref := 'AM-' || to_char(now() at time zone 'Europe/Amsterdam', 'YYYY') || '-' || lpad(nextval('public.aanmelding_ref_seq')::text, 4, '0');
  v_client_id := 'cl_' || (extract(epoch from now()) * 1000)::bigint || '_' || substr(md5(random()::text), 1, 7);
  v_naam := btrim((p->>'voornaam') || ' ' || (p->>'achternaam'));

  -- voorlopig cliëntdossier (spec §2: automatisch aangemaakt)
  insert into public.clienten (id, voornaam, achternaam, locatie, fase, reis_status, gemeente, organisatie, archived, data)
  values (
    v_client_id, btrim(p->>'voornaam'), btrim(p->>'achternaam'), null, 'in aanvraag', 'nieuwe_aanmelding',
    nullif(btrim(coalesce(p->>'gemeente','')), ''), nullif(btrim(coalesce(p->>'verwijzer_organisatie','')), ''), false,
    jsonb_build_object(
      'bsn', p->>'bsn', 'geboortedatum', p->>'geboortedatum', 'geslacht', p->>'geslacht',
      'adres', p->>'adres', 'postcode', p->>'postcode', 'woonplaats', p->>'woonplaats',
      'nationaliteit', p->>'nationaliteit', 'aanmeldportaal', true,
      'inZorgDatum', '', 'uitZorgDatum', '', 'requiredForms', '', 'zijbalkNotities', '', 'tabNotities', ''
    ));

  insert into public.client_aanmeldingen (
    referentie, client_id, status, voornaam, achternaam, bsn, geboortedatum, geslacht, adres, postcode,
    woonplaats, gemeente, nationaliteit, verwijzer_organisatie, verwijzer_naam, verwijzer_functie,
    verwijzer_telefoon, verwijzer_email, reden_aanmelding, hulpvraag, urgentie, veiligheidsrisicos,
    diagnoses, huidige_hulpverlening, school_dagbesteding, gewenste_zorgvorm, gewenste_startdatum,
    contactpersonen, ip_hash)
  values (
    v_ref, v_client_id, 'nieuw', btrim(p->>'voornaam'), btrim(p->>'achternaam'), p->>'bsn',
    nullif(p->>'geboortedatum','')::date, p->>'geslacht', p->>'adres', p->>'postcode',
    p->>'woonplaats', p->>'gemeente', p->>'nationaliteit', p->>'verwijzer_organisatie', p->>'verwijzer_naam',
    p->>'verwijzer_functie', p->>'verwijzer_telefoon', p->>'verwijzer_email', p->>'reden_aanmelding',
    p->>'hulpvraag', nullif(p->>'urgentie',''), p->>'veiligheidsrisicos', p->>'diagnoses',
    p->>'huidige_hulpverlening', p->>'school_dagbesteding', p->>'gewenste_zorgvorm',
    nullif(p->>'gewenste_startdatum','')::date, coalesce(p->'contactpersonen', '[]'::jsonb), nullif(v_ip,''))
  returning id into v_aanmelding_id;

  -- contactpersonen ook als dossier-contacten
  for v_contact in select * from jsonb_array_elements(coalesce(p->'contactpersonen', '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(v_contact->>'naam','')), '') is not null then
      insert into public.client_contacten (client_id, naam, relatie, telefoon, email, gezaghebbend, adres, contact_rol, is_primair, notitie)
      values (v_client_id, btrim(v_contact->>'naam'), v_contact->>'relatie', v_contact->>'telefoon',
              v_contact->>'email', coalesce((v_contact->>'gezaghebbend')::boolean, false), v_contact->>'adres',
              coalesce(nullif(v_contact->>'contact_rol',''), 'overig'), false, null);
    end if;
  end loop;

  -- verwijzer als contact
  if nullif(btrim(coalesce(p->>'verwijzer_naam','')), '') is not null then
    insert into public.client_contacten (client_id, naam, relatie, telefoon, email, organisatie, functie, contact_rol, is_primair)
    values (v_client_id, btrim(p->>'verwijzer_naam'), 'Verwijzer', p->>'verwijzer_telefoon', p->>'verwijzer_email',
            p->>'verwijzer_organisatie', p->>'verwijzer_functie', 'verwijzer', false);
  end if;

  perform public.client_tijdlijn_log(v_client_id, 'aanmelding',
    'Aanmelding ontvangen (' || v_ref || ')',
    'Via het aanmeldportaal door ' || coalesce(nullif(btrim(coalesce(p->>'verwijzer_naam','')), ''), 'onbekende verwijzer')
      || coalesce(' (' || nullif(btrim(coalesce(p->>'verwijzer_organisatie','')), '') || ')', ''),
    'client_aanmeldingen', v_aanmelding_id::text);

  perform public.clientreis_notificeer_beoordelaars(
    'client_aanmelding',
    'Nieuwe aanmelding: ' || v_naam,
    'Er is een nieuwe cliëntaanmelding ontvangen (' || v_ref || ') van '
      || coalesce(nullif(btrim(coalesce(p->>'verwijzer_organisatie','')), ''), 'onbekende organisatie')
      || '. Beoordeel de aanmelding via de pagina Aanmeldingen.',
    'aanmelding', v_aanmelding_id::text);

  return jsonb_build_object('ok', true, 'aanmelding_id', v_aanmelding_id, 'client_id', v_client_id, 'referentie', v_ref);
end; $$;
revoke all on function public.aanmelding_dien_in(jsonb) from public, anon, authenticated;
grant execute on function public.aanmelding_dien_in(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 7. RPC's voor de beoordelings-UI
-- ----------------------------------------------------------------------------
create or replace function public.clientreis_context()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_rollen text[];
begin
  select coalesce(array_agg(distinct r.name), '{}') into v_rollen
  from public.profiles p
  join public.bs2_role_users u on lower(u.user_email) = lower(p.email)
  join public.bs2_roles r on r.id = u.role_id
  where p.id = auth.uid();
  return jsonb_build_object(
    'kan_beoordelen', public.clientreis_kan_beoordelen(),
    'rollen', to_jsonb(coalesce(v_rollen, '{}')));
end; $$;
grant execute on function public.clientreis_context() to authenticated;

create or replace function public.aanmeldingen_lijst(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om aanmeldingen te bekijken';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'referentie', a.referentie, 'client_id', a.client_id, 'status', a.status,
      'voornaam', a.voornaam, 'achternaam', a.achternaam, 'gemeente', a.gemeente,
      'urgentie', a.urgentie, 'gewenste_zorgvorm', a.gewenste_zorgvorm,
      'gewenste_startdatum', a.gewenste_startdatum, 'verwijzer_organisatie', a.verwijzer_organisatie,
      'verwijzer_naam', a.verwijzer_naam, 'aanmaakdatum', a.aanmaakdatum,
      'beoordeeld_door_naam', a.beoordeeld_door_naam, 'beoordeeld_op', a.beoordeeld_op
    ) order by a.aanmaakdatum desc)
    from public.client_aanmeldingen a
    where coalesce(a.archived, false) = false
      and (p_status is null or p_status = '' or a.status = p_status)
  ), '[]'::jsonb);
end; $$;
grant execute on function public.aanmeldingen_lijst(text) to authenticated;

create or replace function public.aanmelding_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om aanmeldingen te bekijken';
  end if;
  select to_jsonb(a) - 'ip_hash' into v from public.client_aanmeldingen a where a.id = p_id;
  if v is null then raise exception 'Aanmelding niet gevonden'; end if;
  return v;
end; $$;
grant execute on function public.aanmelding_detail(uuid) to authenticated;

create or replace function public.aanmelding_beoordeel(
  p_id uuid, p_actie text, p_toelichting text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  a record;
  v_naam text;
  v_uid uuid := auth.uid();
  v_beoordelaar text;
  v_nieuwe_status text;
  v_reis text;
  v_titel text;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om aanmeldingen te beoordelen';
  end if;
  if p_actie not in ('goedkeuren','afwijzen','meer_info','wachtlijst','in_behandeling') then
    raise exception 'Onbekende actie: %', p_actie;
  end if;

  select * into a from public.client_aanmeldingen where id = p_id and coalesce(archived,false) = false;
  if not found then raise exception 'Aanmelding niet gevonden'; end if;
  if a.status in ('goedgekeurd','afgewezen') and p_actie <> 'in_behandeling' then
    raise exception 'Aanmelding is al definitief beoordeeld (%)', a.status;
  end if;

  v_naam := btrim(coalesce(a.voornaam,'') || ' ' || coalesce(a.achternaam,''));
  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '') into v_beoordelaar
    from public.profiles where id = v_uid;
  v_beoordelaar := coalesce(v_beoordelaar, 'Onbekend');

  v_nieuwe_status := case p_actie
    when 'goedkeuren'      then 'goedgekeurd'
    when 'afwijzen'        then 'afgewezen'
    when 'meer_info'       then 'meer_info_nodig'
    when 'wachtlijst'      then 'wachtlijst'
    when 'in_behandeling'  then 'in_beoordeling' end;
  v_reis := case p_actie
    when 'goedkeuren'      then 'intake_gepland'   -- spec §4: na goedkeuring start automatisch een intake
    when 'afwijzen'        then 'dossier_gesloten'
    when 'meer_info'       then 'meer_info_nodig'
    when 'wachtlijst'      then 'wachtlijst'
    when 'in_behandeling'  then 'in_beoordeling' end;

  update public.client_aanmeldingen set
    status = v_nieuwe_status,
    beoordeeld_door = v_uid,
    beoordeeld_door_naam = v_beoordelaar,
    beoordeeld_op = now(),
    beoordeling_toelichting = case when p_actie in ('goedkeuren','afwijzen') then coalesce(p_toelichting, beoordeling_toelichting) else beoordeling_toelichting end,
    meer_info_verzoek = case when p_actie = 'meer_info' then coalesce(p_toelichting, meer_info_verzoek) else meer_info_verzoek end,
    wachtlijst_reden = case when p_actie = 'wachtlijst' then coalesce(p_toelichting, wachtlijst_reden) else wachtlijst_reden end
  where id = p_id;

  if a.client_id is not null then
    update public.clienten set
      reis_status = v_reis,
      archived = case when p_actie = 'afwijzen' then true else archived end
    where id = a.client_id;
  end if;

  v_titel := case p_actie
    when 'goedkeuren'     then 'Aanmelding goedgekeurd'
    when 'afwijzen'       then 'Aanmelding afgewezen'
    when 'meer_info'      then 'Meer informatie opgevraagd'
    when 'wachtlijst'     then 'Op wachtlijst geplaatst'
    when 'in_behandeling' then 'Beoordeling gestart' end;

  if a.client_id is not null then
    perform public.client_tijdlijn_log(a.client_id, 'beoordeling',
      v_titel || ' (' || a.referentie || ')',
      nullif(btrim(coalesce(p_toelichting, '')), ''), 'client_aanmeldingen', p_id::text);
  end if;

  perform public.clientreis_notificeer_beoordelaars(
    'aanmelding_beslissing',
    v_titel || ': ' || v_naam,
    v_beoordelaar || ' heeft de aanmelding ' || a.referentie || ' van ' || v_naam || ' beoordeeld: ' || v_titel || '.'
      || coalesce(' Toelichting: ' || nullif(btrim(coalesce(p_toelichting,'')), ''), ''),
    'aanmelding', p_id::text, v_uid);

  return jsonb_build_object('ok', true, 'status', v_nieuwe_status, 'reis_status', v_reis);
end; $$;
grant execute on function public.aanmelding_beoordeel(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Private storage-bucket voor aanmeld-uploads
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('aanmelding-documenten', 'aanmelding-documenten', false)
on conflict (id) do update set public = false;

do $$ begin
  create policy aanmelding_docs_read on storage.objects
    for select to authenticated
    using (bucket_id = 'aanmelding-documenten' and public.clientreis_kan_beoordelen());
exception when duplicate_object then null; end $$;
-- Upload alleen via service-role (edge function) — geen insert-policy voor authenticated.
