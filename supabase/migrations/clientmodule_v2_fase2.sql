-- ============================================================================
-- Cliëntmodule 2.0 — Fase 2: intake + digitale ondertekening + wachtlijst
--                            + beschikking-uitbreiding + plaatsing
-- Idempotent. Uitrol: node scripts/db-exec.mjs --file supabase/migrations/clientmodule_v2_fase2.sql
-- Zie docs/clientmodule-v2/PLAN.md (vereist fase 1: clientmodule_v2_fase1.sql)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Wachtlijst-fundament: clienten.wachtlijst_sinds (spec §5)
-- ----------------------------------------------------------------------------
alter table public.clienten add column if not exists wachtlijst_sinds timestamptz;

-- fase-sync-trigger uitbreiden: stempel wachtlijst_sinds bij overgang naar wachtlijst
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
    new.reis_status := case lower(coalesce(new.fase, ''))
      when 'in aanvraag' then 'in_beoordeling'
      when 'uit zorg'    then 'uitgestroomd'
      else 'actief' end;
  end if;

  -- wachtlijst-stempel (zowel insert als elke overgang naar wachtlijst)
  if new.reis_status = 'wachtlijst'
     and (tg_op = 'INSERT' or old.reis_status is distinct from new.reis_status) then
    new.wachtlijst_sinds := now();
  end if;

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

-- Backfill voor cliënten die al op de wachtlijst staan (uit de beoordeling)
update public.clienten c
set wachtlijst_sinds = coalesce((
  select max(a.beoordeeld_op) from public.client_aanmeldingen a
  where a.client_id = c.id and a.status = 'wachtlijst'
), now())
where c.reis_status = 'wachtlijst' and c.wachtlijst_sinds is null;

-- ----------------------------------------------------------------------------
-- 2. Intakemodule (spec §4): client_intakes + onderdelen
-- ----------------------------------------------------------------------------
create table if not exists public.client_intakes (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  aanmelding_id uuid,
  status text not null default 'lopend' check (status in ('lopend','afgerond')),
  gestart_op timestamptz not null default now(),
  afgerond_op timestamptz,
  afgerond_door uuid,
  afgerond_door_naam text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);
create index if not exists client_intakes_client_idx on public.client_intakes (client_id, gestart_op desc);

create table if not exists public.client_intake_onderdelen (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.client_intakes(id) on delete cascade,
  onderdeel text not null check (onderdeel in (
    'intakegesprek','veiligheidsanalyse','risicoanalyse','gezinsanalyse',
    'onderwijsanalyse','netwerkanalyse','hulpvraaganalyse')),
  volgorde int not null default 0,
  inhoud text,
  afgerond boolean not null default false,
  ingevuld_door uuid,
  ingevuld_door_naam text,
  laatst_gewijzigd timestamptz not null default now(),
  unique (intake_id, onderdeel)
);
create index if not exists client_intake_onderdelen_intake_idx on public.client_intake_onderdelen (intake_id, volgorde);

alter table public.client_intakes enable row level security;
alter table public.client_intake_onderdelen enable row level security;

-- Lezen mag wie de cliënt mag zien; schrijven alleen via definer-RPC's.
do $$ begin
  create policy client_intakes_select on public.client_intakes
    for select to authenticated
    using (exists (select 1 from public.clienten c where c.id = client_intakes.client_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy client_intake_onderdelen_select on public.client_intake_onderdelen
    for select to authenticated
    using (exists (
      select 1 from public.client_intakes i
      join public.clienten c on c.id = i.client_id
      where i.id = client_intake_onderdelen.intake_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy bureau_lockout on public.client_intakes
    as restrictive for all to authenticated
    using (not is_bureau_only_user()) with check (not is_bureau_only_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy bureau_lockout on public.client_intake_onderdelen
    as restrictive for all to authenticated
    using (not is_bureau_only_user()) with check (not is_bureau_only_user());
exception when duplicate_object then null; end $$;

-- Intake aanmaken (idempotent per cliënt: geen tweede lopende intake)
create or replace function public.clientreis_maak_intake(p_client_id text, p_aanmelding_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
  v_keys text[] := array['intakegesprek','veiligheidsanalyse','risicoanalyse','gezinsanalyse','onderwijsanalyse','netwerkanalyse','hulpvraaganalyse'];
  i int;
begin
  select id into v_id from public.client_intakes
  where client_id = p_client_id and status = 'lopend' limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.client_intakes (client_id, aanmelding_id)
  values (p_client_id, p_aanmelding_id) returning id into v_id;

  for i in 1..array_length(v_keys, 1) loop
    insert into public.client_intake_onderdelen (intake_id, onderdeel, volgorde)
    values (v_id, v_keys[i], i)
    on conflict (intake_id, onderdeel) do nothing;
  end loop;

  perform public.client_tijdlijn_log(p_client_id, 'intake',
    'Intake gestart', 'Intakedossier aangemaakt met 7 onderdelen.', 'client_intakes', v_id::text);
  return v_id;
end; $$;
revoke all on function public.clientreis_maak_intake(text, uuid) from public, anon, authenticated;

-- Onderdeel opslaan/afronden
create or replace function public.intake_onderdeel_opslaan(p_id uuid, p_inhoud text, p_afgerond boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_naam text; v_intake uuid;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om intakes te bewerken';
  end if;
  select intake_id into v_intake from public.client_intake_onderdelen where id = p_id;
  if v_intake is null then raise exception 'Intake-onderdeel niet gevonden'; end if;
  if exists (select 1 from public.client_intakes where id = v_intake and status = 'afgerond') then
    raise exception 'Deze intake is al afgerond';
  end if;
  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
    into v_naam from public.profiles where id = auth.uid();
  update public.client_intake_onderdelen set
    inhoud = p_inhoud,
    afgerond = coalesce(p_afgerond, false),
    ingevuld_door = auth.uid(),
    ingevuld_door_naam = coalesce(v_naam, 'Onbekend'),
    laatst_gewijzigd = now()
  where id = p_id;
  update public.client_intakes set laatst_gewijzigd = now() where id = v_intake;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.intake_onderdeel_opslaan(uuid, text, boolean) to authenticated;

-- Intake afronden (alle 7 onderdelen afgerond vereist) → reis_status intake_afgerond
create or replace function public.intake_afronden(p_intake_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v record;
  v_open int;
  v_naam text;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om intakes af te ronden';
  end if;
  select * into v from public.client_intakes where id = p_intake_id;
  if not found then raise exception 'Intake niet gevonden'; end if;
  if v.status = 'afgerond' then raise exception 'Intake is al afgerond'; end if;
  select count(*) into v_open from public.client_intake_onderdelen
  where intake_id = p_intake_id and afgerond = false;
  if v_open > 0 then
    raise exception 'Nog % onderdeel/onderdelen niet afgerond', v_open;
  end if;
  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
    into v_naam from public.profiles where id = auth.uid();
  update public.client_intakes set
    status = 'afgerond', afgerond_op = now(), afgerond_door = auth.uid(),
    afgerond_door_naam = coalesce(v_naam, 'Onbekend'), laatst_gewijzigd = now()
  where id = p_intake_id;
  update public.clienten set reis_status = 'intake_afgerond'
  where id = v.client_id and reis_status = 'intake_gepland';
  perform public.client_tijdlijn_log(v.client_id, 'intake',
    'Intake afgerond', 'Alle 7 intake-onderdelen zijn afgerond.', 'client_intakes', p_intake_id::text);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.intake_afronden(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. aanmelding_beoordeel: bij goedkeuren automatisch intake starten (spec §4)
-- ----------------------------------------------------------------------------
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
    when 'goedkeuren'      then 'intake_gepland'
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
    -- fase 2: goedkeuren = automatisch intake starten
    if p_actie = 'goedkeuren' then
      perform public.clientreis_maak_intake(a.client_id, p_id);
    end if;
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

-- Backfill: intakes voor cliënten die al op intake_gepland staan (fase-1 QA-instroom)
do $$
declare r record;
begin
  for r in
    select c.id as client_id,
           (select a.id from public.client_aanmeldingen a where a.client_id = c.id order by a.aanmaakdatum desc limit 1) as aanmelding_id
    from public.clienten c
    where c.reis_status = 'intake_gepland'
      and not exists (select 1 from public.client_intakes i where i.client_id = c.id)
  loop
    perform public.clientreis_maak_intake(r.client_id, r.aanmelding_id);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Digitale ondertekening (spec §4): verklaringen-config + verzoeken
-- ----------------------------------------------------------------------------
create table if not exists public.ondertekening_verklaringen (
  type text primary key,
  titel text not null,
  body_html text not null,
  laatst_gewijzigd timestamptz not null default now()
);
alter table public.ondertekening_verklaringen enable row level security;
do $$ begin
  create policy ondertekening_verklaringen_select on public.ondertekening_verklaringen
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

insert into public.ondertekening_verklaringen (type, titel, body_html) values
('privacy', 'Privacyverklaring',
 '<p>Embrace the Future verwerkt persoonsgegevens van de cliënt en diens gezin uitsluitend voor het bieden van verantwoorde jeugdhulp, conform de AVG en de Jeugdwet.</p><p>Door te ondertekenen verklaart u kennis te hebben genomen van de privacyverklaring van Embrace the Future, waarin staat welke gegevens wij vastleggen, met welk doel, hoe lang wij ze bewaren en welke rechten u heeft (inzage, correctie, verwijdering).</p>'),
('toestemming', 'Toestemmingsverklaring',
 '<p>Door te ondertekenen geeft u toestemming aan Embrace the Future voor het bieden van hulpverlening aan de cliënt, het vastleggen van de daarvoor noodzakelijke gegevens in het cliëntdossier en het — uitsluitend waar nodig voor goede zorg — delen van relevante informatie met direct betrokken hulpverleners.</p><p>U kunt deze toestemming op ieder moment intrekken; dit heeft geen terugwerkende kracht.</p>'),
('huisregels', 'Huisregels',
 '<p>Door te ondertekenen verklaart u kennis te hebben genomen van de huisregels van Embrace the Future en deze na te leven. De huisregels gaan onder meer over wederzijds respect, veiligheid, omgang met elkaar en met eigendommen, gebruik van telefoon en sociale media, en afspraken rond bezoek en verlof.</p>'),
('informatieverstrekking', 'Informatieverstrekking',
 '<p>Door te ondertekenen verklaart u akkoord te zijn met de wijze waarop Embrace the Future informatie verstrekt aan ouders/gezaghebbenden, de verwijzer en — indien wettelijk vereist — aan derden zoals de gemeente of de gecertificeerde instelling. Informatie wordt alleen gedeeld voor zover dat noodzakelijk en wettelijk toegestaan is.</p>')
on conflict (type) do nothing;

create table if not exists public.client_ondertekeningen (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  intake_id uuid,
  verklaring_type text not null references public.ondertekening_verklaringen(type),
  ondertekenaar_type text not null check (ondertekenaar_type in ('client','ouder','gezaghebbende','voogd')),
  ondertekenaar_naam text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'open' check (status in ('open','ondertekend','verlopen','ingetrokken')),
  aangemaakt_door uuid,
  aangemaakt_door_naam text,
  ondertekend_op timestamptz,
  storage_path_pdf text,
  storage_path_png text,
  ip_hash text,
  user_agent text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);
create index if not exists client_ondertekeningen_client_idx on public.client_ondertekeningen (client_id, aanmaakdatum desc);

alter table public.client_ondertekeningen enable row level security;
do $$ begin
  create policy client_ondertekeningen_select on public.client_ondertekeningen
    for select to authenticated
    using (exists (select 1 from public.clienten c where c.id = client_ondertekeningen.client_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy bureau_lockout on public.client_ondertekeningen
    as restrictive for all to authenticated
    using (not is_bureau_only_user()) with check (not is_bureau_only_user());
exception when duplicate_object then null; end $$;

-- Onderteken-verzoek aanmaken (intern, beoordelaars)
create or replace function public.ondertekening_maak_verzoek(
  p_client_id text, p_verklaring_type text, p_ondertekenaar_type text, p_ondertekenaar_naam text,
  p_intake_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_token uuid; v_naam text; v_titel text;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om ondertekening aan te vragen';
  end if;
  if not exists (select 1 from public.ondertekening_verklaringen where type = p_verklaring_type) then
    raise exception 'Onbekende verklaring: %', p_verklaring_type;
  end if;
  if p_ondertekenaar_type not in ('client','ouder','gezaghebbende','voogd') then
    raise exception 'Onbekend ondertekenaar-type: %', p_ondertekenaar_type;
  end if;
  if nullif(btrim(coalesce(p_ondertekenaar_naam,'')),'') is null then
    raise exception 'Naam van de ondertekenaar is verplicht';
  end if;
  if not exists (select 1 from public.clienten where id = p_client_id) then
    raise exception 'Cliënt niet gevonden';
  end if;
  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
    into v_naam from public.profiles where id = auth.uid();
  select titel into v_titel from public.ondertekening_verklaringen where type = p_verklaring_type;

  insert into public.client_ondertekeningen
    (client_id, intake_id, verklaring_type, ondertekenaar_type, ondertekenaar_naam, aangemaakt_door, aangemaakt_door_naam)
  values (p_client_id, p_intake_id, p_verklaring_type, p_ondertekenaar_type, btrim(p_ondertekenaar_naam), auth.uid(), coalesce(v_naam,'Onbekend'))
  returning id, token into v_id, v_token;

  perform public.client_tijdlijn_log(p_client_id, 'ondertekening',
    'Ondertekening aangevraagd: ' || v_titel,
    'Voor ' || btrim(p_ondertekenaar_naam) || ' (' || p_ondertekenaar_type || ').',
    'client_ondertekeningen', v_id::text);

  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
end; $$;
grant execute on function public.ondertekening_maak_verzoek(text, text, text, text, uuid) to authenticated;

-- Verzoek intrekken (intern)
create or replace function public.ondertekening_intrekken(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten';
  end if;
  select * into v from public.client_ondertekeningen where id = p_id;
  if not found then raise exception 'Verzoek niet gevonden'; end if;
  if v.status <> 'open' then raise exception 'Alleen open verzoeken kunnen worden ingetrokken'; end if;
  update public.client_ondertekeningen set status = 'ingetrokken', laatst_gewijzigd = now() where id = p_id;
  perform public.client_tijdlijn_log(v.client_id, 'ondertekening',
    'Ondertekening ingetrokken', null, 'client_ondertekeningen', p_id::text);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.ondertekening_intrekken(uuid) to authenticated;

-- Publieke info-opvraag + indienen — ALLEEN service-role (edge function client-ondertekening)
create or replace function public.ondertekening_info(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; v_titel text; v_body text; v_voornaam text;
begin
  select * into v from public.client_ondertekeningen where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  if v.status = 'open' and v.aanmaakdatum < now() - interval '30 days' then
    update public.client_ondertekeningen set status = 'verlopen', laatst_gewijzigd = now() where id = v.id;
    v.status := 'verlopen';
  end if;
  if v.status <> 'open' then return jsonb_build_object('ok', false, 'fout', v.status); end if;
  select titel, body_html into v_titel, v_body from public.ondertekening_verklaringen where type = v.verklaring_type;
  select voornaam into v_voornaam from public.clienten where id = v.client_id;
  return jsonb_build_object('ok', true, 'titel', v_titel, 'body_html', v_body,
    'ondertekenaar_naam', v.ondertekenaar_naam, 'ondertekenaar_type', v.ondertekenaar_type,
    'client_voornaam', coalesce(v_voornaam, ''));
end; $$;
revoke all on function public.ondertekening_info(uuid) from public, anon, authenticated;
grant execute on function public.ondertekening_info(uuid) to service_role;

create or replace function public.ondertekening_dien_in(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; v_titel text;
begin
  select * into v from public.client_ondertekeningen where token = (p->>'token')::uuid;
  if not found then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;
  if v.status <> 'open' then return jsonb_build_object('ok', false, 'fout', v.status); end if;
  if v.aanmaakdatum < now() - interval '30 days' then
    update public.client_ondertekeningen set status = 'verlopen', laatst_gewijzigd = now() where id = v.id;
    return jsonb_build_object('ok', false, 'fout', 'verlopen');
  end if;

  update public.client_ondertekeningen set
    status = 'ondertekend', ondertekend_op = now(),
    ip_hash = nullif(p->>'ip_hash',''), user_agent = left(coalesce(p->>'user_agent',''), 300),
    laatst_gewijzigd = now()
  where id = v.id;

  select titel into v_titel from public.ondertekening_verklaringen where type = v.verklaring_type;
  perform public.client_tijdlijn_log(v.client_id, 'ondertekening',
    'Ondertekend: ' || v_titel,
    'Door ' || v.ondertekenaar_naam || ' (' || v.ondertekenaar_type || ').',
    'client_ondertekeningen', v.id::text);
  perform public.clientreis_notificeer_beoordelaars(
    'client_ondertekening',
    'Verklaring ondertekend: ' || v_titel,
    v.ondertekenaar_naam || ' (' || v.ondertekenaar_type || ') heeft de verklaring "' || v_titel || '" digitaal ondertekend.',
    'client', v.client_id);
  return jsonb_build_object('ok', true, 'id', v.id, 'client_id', v.client_id, 'verklaring_type', v.verklaring_type, 'titel', v_titel,
    'ondertekenaar_naam', v.ondertekenaar_naam, 'ondertekenaar_type', v.ondertekenaar_type);
end; $$;
revoke all on function public.ondertekening_dien_in(jsonb) from public, anon, authenticated;
grant execute on function public.ondertekening_dien_in(jsonb) to service_role;

-- Private bucket voor handtekeningen + aktes
insert into storage.buckets (id, name, public)
values ('client-ondertekeningen', 'client-ondertekeningen', false)
on conflict (id) do update set public = false;

do $$ begin
  create policy ondertekening_docs_read on storage.objects
    for select to authenticated
    using (bucket_id = 'client-ondertekeningen' and public.clientreis_kan_beoordelen());
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 5. Wachtlijst-overzicht (spec §5)
-- ----------------------------------------------------------------------------
create or replace function public.wachtlijst_overzicht()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_rijen jsonb; v_kpis jsonb;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om de wachtlijst te bekijken';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', c.id,
    'naam', btrim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')),
    'gemeente', coalesce(nullif(a.gemeente,''), c.gemeente),
    'urgentie', a.urgentie,
    'product', a.gewenste_zorgvorm,
    'verwachte_startdatum', a.gewenste_startdatum,
    'wachtlijst_sinds', c.wachtlijst_sinds,
    'dagen_wachtend', greatest(0, (now()::date - coalesce(c.wachtlijst_sinds, now())::date)),
    'reden', a.wachtlijst_reden,
    'referentie', a.referentie
  ) order by c.wachtlijst_sinds asc nulls last), '[]'::jsonb)
  into v_rijen
  from public.clienten c
  left join lateral (
    select * from public.client_aanmeldingen a
    where a.client_id = c.id order by a.aanmaakdatum desc limit 1
  ) a on true
  where c.reis_status = 'wachtlijst' and coalesce(c.archived, false) = false;

  select jsonb_build_object(
    'aantal', count(*),
    'gem_wachttijd_dagen', coalesce(round(avg(now()::date - coalesce(c.wachtlijst_sinds, now())::date))::int, 0),
    'per_gemeente', coalesce((
      select jsonb_agg(jsonb_build_object('gemeente', g.gemeente, 'aantal', g.n, 'gem_dagen', g.gem) order by g.n desc)
      from (
        select coalesce(nullif(c2.gemeente,''), 'Onbekend') as gemeente, count(*) as n,
               round(avg(now()::date - coalesce(c2.wachtlijst_sinds, now())::date))::int as gem
        from public.clienten c2
        where c2.reis_status = 'wachtlijst' and coalesce(c2.archived,false) = false
        group by 1
      ) g), '[]'::jsonb),
    'per_product', coalesce((
      select jsonb_agg(jsonb_build_object('product', p.product, 'aantal', p.n, 'gem_dagen', p.gem) order by p.n desc)
      from (
        select coalesce(nullif(a2.gewenste_zorgvorm,''), 'Onbekend') as product, count(*) as n,
               round(avg(now()::date - coalesce(c3.wachtlijst_sinds, now())::date))::int as gem
        from public.clienten c3
        left join lateral (
          select gewenste_zorgvorm from public.client_aanmeldingen a
          where a.client_id = c3.id order by a.aanmaakdatum desc limit 1
        ) a2 on true
        where c3.reis_status = 'wachtlijst' and coalesce(c3.archived,false) = false
        group by 1
      ) p), '[]'::jsonb)
  ) into v_kpis
  from public.clienten c
  where c.reis_status = 'wachtlijst' and coalesce(c.archived, false) = false;

  return jsonb_build_object('kpis', v_kpis, 'rijen', v_rijen);
end; $$;
grant execute on function public.wachtlijst_overzicht() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Plaatsing / statusovergangen (spec §1 + plaatsing)
-- ----------------------------------------------------------------------------
create or replace function public.clientreis_zet_status(p_client_id text, p_status text, p_toelichting text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c record;
  v_ok boolean := false;
  v_vandaag text := to_char(now() at time zone 'Europe/Amsterdam', 'YYYY-MM-DD');
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om de cliëntreis-status te wijzigen';
  end if;
  select * into c from public.clienten where id = p_client_id;
  if not found then raise exception 'Cliënt niet gevonden'; end if;

  -- toegestane overgangen in fase 2 (uitstroom/nazorg volgen in fase 6)
  v_ok := (c.reis_status = 'intake_afgerond'     and p_status in ('plaatsing_gepland','wachtlijst'))
       or (c.reis_status = 'wachtlijst'          and p_status = 'plaatsing_gepland')
       or (c.reis_status = 'plaatsing_gepland'   and p_status in ('actief','wachtlijst'))
       or (c.reis_status = 'actief'              and p_status = 'tijdelijk_gepauzeerd')
       or (c.reis_status = 'tijdelijk_gepauzeerd' and p_status = 'actief');
  if not v_ok then
    raise exception 'Overgang % → % is niet toegestaan', c.reis_status, p_status;
  end if;

  update public.clienten set
    reis_status = p_status,
    data = case
      when p_status = 'actief' and nullif(btrim(coalesce(data->>'inZorgDatum','')), '') is null
        then jsonb_set(coalesce(data, '{}'::jsonb), '{inZorgDatum}', to_jsonb(v_vandaag))
      else data end
  where id = p_client_id;

  if nullif(btrim(coalesce(p_toelichting,'')),'') is not null then
    perform public.client_tijdlijn_log(p_client_id, 'status_wijziging',
      'Toelichting bij statuswijziging', btrim(p_toelichting), 'clienten', p_client_id);
  end if;
  return jsonb_build_object('ok', true, 'reis_status', p_status);
end; $$;
grant execute on function public.clientreis_zet_status(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Beschikkingen-uitbreiding (spec §11): gemeente + productcode + 90d-mijlpaal
-- ----------------------------------------------------------------------------
alter table public.beschikkingen add column if not exists gemeente text;
alter table public.beschikkingen add column if not exists productcode text;

-- Backfill gemeente vanuit de cliënt (zowel directe id-koppeling als BS2-id)
update public.beschikkingen b
set gemeente = c.gemeente
from public.clienten c
where b.gemeente is null
  and nullif(btrim(coalesce(c.gemeente,'')),'') is not null
  and (c.id = b.client_id or c.data->>'bs2_id' = b.client_id);

-- Verloop-herinneringen: 90-dagen-mijlpaal toevoegen (spec §11: 90/60/30 + verlopen)
create or replace function public.beschikking_verloop_herinneringen(p_dry_run boolean default false)
returns table(processed integer, inserted integer, skipped integer)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_today      date  := (now() at time zone 'Europe/Amsterdam')::date;
  v_milestones int[] := array[90,60,30,14,7,0];
  v_processed  int := 0;
  v_inserted   int := 0;
  v_skipped    int := 0;
  r            record;
  rec          record;
  v_m          int;
  v_dagen      int;
  v_wanneer    text;
  v_titel      text;
  v_body       text;
  v_notif_id   uuid;
  v_ids        uuid[] := '{}';
  v_secret     text;
  v_url        text := 'https://ukjflilnhigozfoxowmj.supabase.co/functions/v1/taken-herinnering-push';
begin
  for r in
    select
      b.id::text                                                    as besch_id,
      coalesce(nullif(btrim(b.naam), ''), 'Beschikking')            as besch_naam,
      b.eind_iso                                                    as eind_iso,
      (b.eind_iso - v_today)                                        as dagen,
      btrim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')) as client_naam,
      lower(nullif(btrim(c.data->>'gedragswetenschapper_email'), '')) as gw_email
    from public.beschikkingen b
    join public.clienten c
      on (c.data->>'bs2_id' = b.client_id or c.id = b.client_id)
    where coalesce(b.gearchiveerd, false) = false
      and b.eind_iso is not null
      and lower(coalesce(c.fase, '')) = 'in zorg'
      and (b.eind_iso - v_today) between 0 and 90
  loop
    v_dagen := r.dagen;
    select min(m) into v_m from unnest(v_milestones) as m where m >= v_dagen;
    if v_m is null then v_m := 0; end if;
    v_processed := v_processed + 1;

    if v_dagen <= 0 then v_wanneer := 'verloopt vandaag';
    elsif v_dagen = 1 then v_wanneer := 'verloopt morgen';
    else v_wanneer := 'verloopt over ' || v_dagen || ' dagen'; end if;

    v_titel := 'Beschikking ' || v_wanneer || ': ' || r.client_naam;
    v_body  := 'De beschikking "' || r.besch_naam || '" van ' || r.client_naam || ' ' || v_wanneer
               || ' (' || to_char(r.eind_iso, 'DD-MM-YYYY') || '). Onderneem tijdig actie voor verlenging van de beschikking.';

    for rec in
      select distinct p.id as user_id
      from public.profiles p
      where coalesce(p.archived, false) = false
        and p.email is not null
        and (
          exists (
            select 1 from public.bs2_role_users u
            join public.bs2_roles ro on ro.id = u.role_id
            where ro.slug in ('directeur','teamleider')
              and lower(u.user_email) = lower(p.email)
          )
          or (r.gw_email is not null and lower(p.email) = r.gw_email)
        )
    loop
      if exists (
        select 1 from public.beschikking_verloop_log l
        where l.beschikking_id = r.besch_id and l.user_id = rec.user_id and l.milestone = v_m
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if not p_dry_run then
        insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
        values (rec.user_id, 'beschikking_verloop_herinnering', v_titel, v_body, 'beschikking', r.besch_id)
        returning id into v_notif_id;

        insert into public.beschikking_verloop_log (beschikking_id, user_id, milestone, notification_id)
        values (r.besch_id, rec.user_id, v_m, v_notif_id);

        v_ids := array_append(v_ids, v_notif_id);
      end if;

      v_inserted := v_inserted + 1;
    end loop;
  end loop;

  if not p_dry_run and array_length(v_ids, 1) > 0 then
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

  return query select v_processed, v_inserted, v_skipped;
end;
$$;
