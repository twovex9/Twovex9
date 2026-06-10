-- ============================================================
-- Cliëntmodule 2.0 — FASE 3: actief dossier
--   1. client_medewerkers (koppeltabel cliënt ↔ medewerker)
--   2. toegangshelpers (client_zorg_toegang, gekoppelde ids)
--   3. zorgplannen (workflow + tekenflow-hergebruik fase 2)
--   4. signaleringsplannen
--   5. client_contactlog (contactlogboek §14)
--   6. client_rapportages: kolommen + RLS-aanscherping (§8/§16)
--   7. kwaliteit: verbeteringsmaatregelen-koppelkolommen (§6)
--   8. tekenflow-uitbreiding (zorgplan_id + body_override_html)
--   9. zorgplan-/signaleringsplan-RPC's (SECURITY DEFINER, fail-closed)
--  10. tijdlijn-triggers (rapportage/contactlog/klacht/incident/plannen)
--  11. AI-cliëntsamenvatting (deterministisch, §7)
--  12. clienten-RLS: gekoppelde medewerker ziet dossier
-- Idempotent. Uitvoeren: node scripts/db-exec.mjs --file supabase/migrations/clientmodule_v2_fase3.sql
-- ============================================================

-- ---------- 1. client_medewerkers ----------
create table if not exists public.client_medewerkers (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clienten(id) on delete cascade,
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  rol text not null default 'begeleider',
  created_by uuid,
  created_by_naam text,
  aanmaakdatum timestamptz not null default now(),
  unique (client_id, medewerker_id, rol)
);
alter table public.client_medewerkers drop constraint if exists client_medewerkers_rol_check;
alter table public.client_medewerkers add constraint client_medewerkers_rol_check
  check (rol in ('begeleider','mentor','zorgcoordinator','gedragswetenschapper'));
create index if not exists client_medewerkers_client_idx on public.client_medewerkers (client_id);
create index if not exists client_medewerkers_medewerker_idx on public.client_medewerkers (medewerker_id);

-- ---------- 2. toegangshelpers ----------
create or replace function public.current_user_gekoppelde_client_ids()
returns setof text
language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $$
  select cm.client_id
  from public.client_medewerkers cm
  join public.profiles p on p.medewerker_id = cm.medewerker_id
  where p.id = auth.uid();
$$;
revoke all on function public.current_user_gekoppelde_client_ids() from public, anon;
grant execute on function public.current_user_gekoppelde_client_ids() to authenticated;

-- Zorg-toegang tot een dossier: office-rollen, gekoppelde medewerkers
-- of medewerkers van dezelfde locatie. Bureau wordt elders (restrictive
-- bureau_lockout) geweerd; Finance/Beleid/Facilitair vallen hier buiten.
create or replace function public.client_zorg_toegang(p_client_id text)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $$
  select public.is_admin(auth.uid())
      or public.is_hr()
      or public.is_office_clientviewer()
      or p_client_id in (select public.current_user_gekoppelde_client_ids())
      or exists (
           select 1 from public.clienten c
           where c.id = p_client_id
             and c.locatie in (select public.current_user_medewerker_locatie_namen())
         );
$$;
revoke all on function public.client_zorg_toegang(text) from public, anon;
grant execute on function public.client_zorg_toegang(text) to authenticated;

-- RLS client_medewerkers
alter table public.client_medewerkers enable row level security;
drop policy if exists "bureau_lockout" on public.client_medewerkers;
create policy "bureau_lockout" on public.client_medewerkers
  as restrictive for all to authenticated
  using ((select not public.is_bureau_only_user()))
  with check ((select not public.is_bureau_only_user()));
drop policy if exists "client_medewerkers select zorg-toegang" on public.client_medewerkers;
create policy "client_medewerkers select zorg-toegang" on public.client_medewerkers
  for select to authenticated using (public.client_zorg_toegang(client_id));
drop policy if exists "client_medewerkers insert beoordelaar" on public.client_medewerkers;
create policy "client_medewerkers insert beoordelaar" on public.client_medewerkers
  for insert to authenticated with check (public.clientreis_kan_beoordelen());
drop policy if exists "client_medewerkers update beoordelaar" on public.client_medewerkers;
create policy "client_medewerkers update beoordelaar" on public.client_medewerkers
  for update to authenticated
  using (public.clientreis_kan_beoordelen())
  with check (public.clientreis_kan_beoordelen());
drop policy if exists "client_medewerkers delete beoordelaar" on public.client_medewerkers;
create policy "client_medewerkers delete beoordelaar" on public.client_medewerkers
  for delete to authenticated using (public.clientreis_kan_beoordelen());

-- ---------- helper: laatst_gewijzigd-touch ----------
create or replace function public.tg_fase3_touch()
returns trigger language plpgsql as $$
begin
  new.laatst_gewijzigd := now();
  return new;
end; $$;

-- ---------- 3. zorgplannen ----------
create table if not exists public.zorgplannen (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clienten(id) on delete cascade,
  titel text not null default 'Zorgplan',
  hulpvraag text,
  doelen jsonb not null default '[]'::jsonb,
  acties text,
  risicoanalyse text,
  signalering text,
  evaluatiemoment date,
  status text not null default 'concept',
  gw_akkoord_door uuid,
  gw_akkoord_door_naam text,
  gw_akkoord_op timestamptz,
  ondertekening_id uuid references public.client_ondertekeningen(id) on delete set null,
  actief_sinds timestamptz,
  geevalueerd_op timestamptz,
  evaluatie_verslag text,
  vervangen_door uuid references public.zorgplannen(id) on delete set null,
  created_by uuid,
  created_by_naam text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);
alter table public.zorgplannen drop constraint if exists zorgplannen_status_check;
alter table public.zorgplannen add constraint zorgplannen_status_check
  check (status in ('concept','gw_akkoord','ter_ondertekening','actief','geevalueerd','vervangen'));
create index if not exists zorgplannen_client_idx on public.zorgplannen (client_id);
create index if not exists zorgplannen_status_idx on public.zorgplannen (status);
drop trigger if exists trg_zorgplannen_touch on public.zorgplannen;
create trigger trg_zorgplannen_touch before update on public.zorgplannen
  for each row execute function public.tg_fase3_touch();

alter table public.zorgplannen enable row level security;
drop policy if exists "bureau_lockout" on public.zorgplannen;
create policy "bureau_lockout" on public.zorgplannen
  as restrictive for all to authenticated
  using ((select not public.is_bureau_only_user()))
  with check ((select not public.is_bureau_only_user()));
drop policy if exists "zorgplannen select zorg-toegang" on public.zorgplannen;
create policy "zorgplannen select zorg-toegang" on public.zorgplannen
  for select to authenticated using (public.client_zorg_toegang(client_id));
drop policy if exists "zorgplannen insert beoordelaar" on public.zorgplannen;
create policy "zorgplannen insert beoordelaar" on public.zorgplannen
  for insert to authenticated with check (public.clientreis_kan_beoordelen());
drop policy if exists "zorgplannen update beoordelaar" on public.zorgplannen;
create policy "zorgplannen update beoordelaar" on public.zorgplannen
  for update to authenticated
  using (public.clientreis_kan_beoordelen())
  with check (public.clientreis_kan_beoordelen());
drop policy if exists "zorgplannen delete beoordelaar" on public.zorgplannen;
create policy "zorgplannen delete beoordelaar" on public.zorgplannen
  for delete to authenticated using (public.clientreis_kan_beoordelen());

-- ---------- 4. signaleringsplannen ----------
create table if not exists public.signaleringsplannen (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clienten(id) on delete cascade,
  triggers text,
  spanningssignalen text,
  escalatiefases jsonb not null default '[]'::jsonb,
  interventies text,
  veiligheidsafspraken text,
  status text not null default 'concept',
  actief_sinds timestamptz,
  vervangen_door uuid references public.signaleringsplannen(id) on delete set null,
  created_by uuid,
  created_by_naam text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);
alter table public.signaleringsplannen drop constraint if exists signaleringsplannen_status_check;
alter table public.signaleringsplannen add constraint signaleringsplannen_status_check
  check (status in ('concept','actief','vervangen'));
create index if not exists signaleringsplannen_client_idx on public.signaleringsplannen (client_id);
drop trigger if exists trg_signaleringsplannen_touch on public.signaleringsplannen;
create trigger trg_signaleringsplannen_touch before update on public.signaleringsplannen
  for each row execute function public.tg_fase3_touch();

alter table public.signaleringsplannen enable row level security;
drop policy if exists "bureau_lockout" on public.signaleringsplannen;
create policy "bureau_lockout" on public.signaleringsplannen
  as restrictive for all to authenticated
  using ((select not public.is_bureau_only_user()))
  with check ((select not public.is_bureau_only_user()));
drop policy if exists "signaleringsplannen select zorg-toegang" on public.signaleringsplannen;
create policy "signaleringsplannen select zorg-toegang" on public.signaleringsplannen
  for select to authenticated using (public.client_zorg_toegang(client_id));
drop policy if exists "signaleringsplannen insert beoordelaar" on public.signaleringsplannen;
create policy "signaleringsplannen insert beoordelaar" on public.signaleringsplannen
  for insert to authenticated with check (public.clientreis_kan_beoordelen());
drop policy if exists "signaleringsplannen update beoordelaar" on public.signaleringsplannen;
create policy "signaleringsplannen update beoordelaar" on public.signaleringsplannen
  for update to authenticated
  using (public.clientreis_kan_beoordelen())
  with check (public.clientreis_kan_beoordelen());
drop policy if exists "signaleringsplannen delete beoordelaar" on public.signaleringsplannen;
create policy "signaleringsplannen delete beoordelaar" on public.signaleringsplannen
  for delete to authenticated using (public.clientreis_kan_beoordelen());

-- ---------- 5. client_contactlog ----------
create table if not exists public.client_contactlog (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clienten(id) on delete cascade,
  type text not null default 'overig',
  datum date not null default current_date,
  tijd time,
  met_wie text,
  onderwerp text not null default '',
  verslag text,
  vervolgacties text,
  created_by uuid,
  created_by_naam text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);
alter table public.client_contactlog drop constraint if exists client_contactlog_type_check;
alter table public.client_contactlog add constraint client_contactlog_type_check
  check (type in ('oudergesprek','verwijzersoverleg','gemeentecontact','schoolcontact','mdo','casusoverleg','overig'));
create index if not exists client_contactlog_client_idx on public.client_contactlog (client_id);
drop trigger if exists trg_client_contactlog_touch on public.client_contactlog;
create trigger trg_client_contactlog_touch before update on public.client_contactlog
  for each row execute function public.tg_fase3_touch();

alter table public.client_contactlog enable row level security;
drop policy if exists "bureau_lockout" on public.client_contactlog;
create policy "bureau_lockout" on public.client_contactlog
  as restrictive for all to authenticated
  using ((select not public.is_bureau_only_user()))
  with check ((select not public.is_bureau_only_user()));
drop policy if exists "contactlog select zorg-toegang" on public.client_contactlog;
create policy "contactlog select zorg-toegang" on public.client_contactlog
  for select to authenticated using (public.client_zorg_toegang(client_id));
drop policy if exists "contactlog insert gekoppeld" on public.client_contactlog;
create policy "contactlog insert gekoppeld" on public.client_contactlog
  for insert to authenticated
  with check (public.client_zorg_toegang(client_id) and created_by = auth.uid());
drop policy if exists "contactlog update eigen of office" on public.client_contactlog;
create policy "contactlog update eigen of office" on public.client_contactlog
  for update to authenticated
  using (public.is_office_clientviewer() or created_by = auth.uid())
  with check (public.is_office_clientviewer() or created_by = auth.uid());
drop policy if exists "contactlog delete office" on public.client_contactlog;
create policy "contactlog delete office" on public.client_contactlog
  for delete to authenticated
  using (public.is_admin(auth.uid()) or public.is_hr() or public.is_office_clientviewer());

-- ---------- 6. client_rapportages: kolommen + RLS-aanscherping ----------
alter table public.client_rapportages add column if not exists tijd time;
alter table public.client_rapportages add column if not exists doel_ids jsonb not null default '[]'::jsonb;
alter table public.client_rapportages add column if not exists auteur_naam text;
alter table public.client_rapportages drop constraint if exists client_rapportages_type_check;
alter table public.client_rapportages add constraint client_rapportages_type_check
  check (type is null or type in ('dag','ambulant','evaluatie','contact','incident','voortgang','overdracht','overig'));

drop policy if exists "auth kan client_rapportages lezen" on public.client_rapportages;
drop policy if exists "auth kan client_rapportages toevoegen" on public.client_rapportages;
drop policy if exists "auth kan client_rapportages bewerken" on public.client_rapportages;
drop policy if exists "auth kan client_rapportages verwijderen" on public.client_rapportages;
drop policy if exists "rapportages select zorg-toegang" on public.client_rapportages;
create policy "rapportages select zorg-toegang" on public.client_rapportages
  for select to authenticated using (public.client_zorg_toegang(client_id));
drop policy if exists "rapportages insert gekoppeld" on public.client_rapportages;
create policy "rapportages insert gekoppeld" on public.client_rapportages
  for insert to authenticated
  with check (public.client_zorg_toegang(client_id) and auteur_id = auth.uid());
drop policy if exists "rapportages update eigen of office" on public.client_rapportages;
create policy "rapportages update eigen of office" on public.client_rapportages
  for update to authenticated
  using (public.is_office_clientviewer() or auteur_id = auth.uid())
  with check (public.is_office_clientviewer() or auteur_id = auth.uid());
drop policy if exists "rapportages delete office" on public.client_rapportages;
create policy "rapportages delete office" on public.client_rapportages
  for delete to authenticated
  using (public.is_admin(auth.uid()) or public.is_hr() or public.is_office_clientviewer());

-- ---------- 7. kwaliteit: verbeteringsmaatregelen-koppelingen ----------
alter table public.verbeteringsmaatregelen add column if not exists client_id text references public.clienten(id) on delete set null;
alter table public.verbeteringsmaatregelen add column if not exists incident_id uuid references public.incidenten(id) on delete set null;
alter table public.verbeteringsmaatregelen add column if not exists klacht_id uuid references public.klachten(id) on delete set null;
create index if not exists verbeteringsmaatregelen_client_idx on public.verbeteringsmaatregelen (client_id);

-- ---------- 8. tekenflow-uitbreiding voor zorgplannen ----------
alter table public.client_ondertekeningen add column if not exists zorgplan_id uuid references public.zorgplannen(id) on delete set null;
alter table public.client_ondertekeningen add column if not exists body_override_html text;
create index if not exists client_ondertekeningen_zorgplan_idx on public.client_ondertekeningen (zorgplan_id);

insert into public.ondertekening_verklaringen (type, titel, body_html)
values ('zorgplan', 'Zorgplan — akkoord en ondertekening',
  '<p>Hierbij verklaar ik kennis te hebben genomen van het zorgplan en ga ik akkoord met de inhoud, de gestelde doelen en de gemaakte afspraken.</p>')
on conflict (type) do nothing;

-- ondertekening_info: body_override_html heeft voorrang op de verklaring-body
create or replace function public.ondertekening_info(p_token uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
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
  return jsonb_build_object('ok', true, 'titel', v_titel,
    'body_html', coalesce(nullif(v.body_override_html, ''), v_body),
    'ondertekenaar_naam', v.ondertekenaar_naam, 'ondertekenaar_type', v.ondertekenaar_type,
    'client_voornaam', coalesce(v_voornaam, ''));
end; $$;

-- ondertekening_dien_in: bij zorgplan-ondertekening wordt het plan actief
create or replace function public.ondertekening_dien_in(p jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
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

  if v.zorgplan_id is not null then
    update public.zorgplannen
       set status = 'vervangen', vervangen_door = v.zorgplan_id, laatst_gewijzigd = now()
     where client_id = v.client_id and status = 'actief' and id <> v.zorgplan_id and not archived;
    update public.zorgplannen
       set status = 'actief', actief_sinds = now(), ondertekening_id = v.id, laatst_gewijzigd = now()
     where id = v.zorgplan_id and status = 'ter_ondertekening';
    perform public.client_tijdlijn_log(v.client_id, 'zorgplan',
      'Zorgplan actief',
      'Het zorgplan is digitaal ondertekend en daarmee actief.',
      'zorgplannen', v.zorgplan_id::text);
  end if;

  perform public.clientreis_notificeer_beoordelaars(
    'client_ondertekening',
    'Verklaring ondertekend: ' || v_titel,
    v.ondertekenaar_naam || ' (' || v.ondertekenaar_type || ') heeft de verklaring "' || v_titel || '" digitaal ondertekend.',
    'client', v.client_id);
  return jsonb_build_object('ok', true, 'id', v.id, 'client_id', v.client_id, 'verklaring_type', v.verklaring_type, 'titel', v_titel,
    'ondertekenaar_naam', v.ondertekenaar_naam, 'ondertekenaar_type', v.ondertekenaar_type);
end; $$;

-- ---------- 9. zorgplan-/signaleringsplan-RPC's ----------
create or replace function public.fase3_html_escape(p text)
returns text language sql immutable as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

-- Alleen gedragswetenschapper of admin-tier mag het GW-akkoord geven (§9)
create or replace function public.zorgplan_kan_gw_akkoord()
returns boolean
language sql stable security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (
      p.rol = 'admin'
      or exists (
        select 1 from public.bs2_role_users u
        join public.bs2_roles r on r.id = u.role_id
        where lower(u.user_email) = lower(p.email)
          and r.slug in ('admin','eigenaar','gedragswetenschapper')
      )
    )
  );
$$;
revoke all on function public.zorgplan_kan_gw_akkoord() from public, anon;
grant execute on function public.zorgplan_kan_gw_akkoord() to authenticated;

create or replace function public.zorgplan_gw_akkoord(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record; v_naam text;
begin
  if not public.zorgplan_kan_gw_akkoord() then
    raise exception 'Alleen een gedragswetenschapper kan akkoord geven op een zorgplan';
  end if;
  select * into v from public.zorgplannen where id = p_id and not archived;
  if not found then raise exception 'Zorgplan niet gevonden'; end if;
  if v.status <> 'concept' then raise exception 'Alleen een concept-zorgplan kan akkoord krijgen (status: %)', v.status; end if;
  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
    into v_naam from public.profiles where id = auth.uid();
  update public.zorgplannen set
    status = 'gw_akkoord', gw_akkoord_door = auth.uid(),
    gw_akkoord_door_naam = coalesce(v_naam, 'Onbekend'), gw_akkoord_op = now(),
    laatst_gewijzigd = now()
  where id = p_id;
  perform public.client_tijdlijn_log(v.client_id, 'zorgplan',
    'Zorgplan: GW-akkoord',
    'Gedragswetenschapper ' || coalesce(v_naam, 'Onbekend') || ' heeft akkoord gegeven op "' || v.titel || '".',
    'zorgplannen', p_id::text);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.zorgplan_gw_akkoord(uuid) from public, anon;
grant execute on function public.zorgplan_gw_akkoord(uuid) to authenticated;

create or replace function public.zorgplan_ter_ondertekening(
  p_id uuid, p_ondertekenaar_type text, p_ondertekenaar_naam text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v record; v_client record; v_naam text; v_body text; v_doel jsonb;
  v_ond_id uuid; v_token uuid;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om een zorgplan ter ondertekening aan te bieden';
  end if;
  select * into v from public.zorgplannen where id = p_id and not archived;
  if not found then raise exception 'Zorgplan niet gevonden'; end if;
  if v.status <> 'gw_akkoord' then
    raise exception 'Zorgplan moet eerst GW-akkoord hebben (status: %)', v.status;
  end if;
  if p_ondertekenaar_type not in ('client','ouder','gezaghebbende','voogd') then
    raise exception 'Onbekend ondertekenaar-type: %', p_ondertekenaar_type;
  end if;
  if nullif(btrim(coalesce(p_ondertekenaar_naam,'')),'') is null then
    raise exception 'Naam van de ondertekenaar is verplicht';
  end if;
  select * into v_client from public.clienten where id = v.client_id;

  v_body := '<p><strong>' || public.fase3_html_escape(v.titel) || '</strong> voor '
    || public.fase3_html_escape(btrim(coalesce(v_client.voornaam,'') || ' ' || coalesce(v_client.achternaam,''))) || '</p>';
  if nullif(btrim(coalesce(v.hulpvraag,'')),'') is not null then
    v_body := v_body || '<p><strong>Hulpvraag:</strong> ' || public.fase3_html_escape(v.hulpvraag) || '</p>';
  end if;
  if jsonb_typeof(v.doelen) = 'array' and jsonb_array_length(v.doelen) > 0 then
    v_body := v_body || '<p><strong>Doelen:</strong></p>';
    for v_doel in select * from jsonb_array_elements(v.doelen) loop
      v_body := v_body || '<p>&bull; ' || public.fase3_html_escape(coalesce(v_doel->>'titel',''))
        || case when nullif(btrim(coalesce(v_doel->>'omschrijving','')),'') is not null
             then ' &mdash; ' || public.fase3_html_escape(v_doel->>'omschrijving') else '' end
        || '</p>';
    end loop;
  end if;
  if nullif(btrim(coalesce(v.acties,'')),'') is not null then
    v_body := v_body || '<p><strong>Acties:</strong> ' || public.fase3_html_escape(v.acties) || '</p>';
  end if;
  if nullif(btrim(coalesce(v.risicoanalyse,'')),'') is not null then
    v_body := v_body || '<p><strong>Risicoanalyse:</strong> ' || public.fase3_html_escape(v.risicoanalyse) || '</p>';
  end if;
  if nullif(btrim(coalesce(v.signalering,'')),'') is not null then
    v_body := v_body || '<p><strong>Signalering:</strong> ' || public.fase3_html_escape(v.signalering) || '</p>';
  end if;
  if v.evaluatiemoment is not null then
    v_body := v_body || '<p><strong>Evaluatiemoment:</strong> ' || to_char(v.evaluatiemoment, 'DD-MM-YYYY') || '</p>';
  end if;
  v_body := v_body || '<p>Hierbij verklaar ik kennis te hebben genomen van dit zorgplan en ga ik akkoord met de inhoud, de gestelde doelen en de gemaakte afspraken.</p>';

  select nullif(btrim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
    into v_naam from public.profiles where id = auth.uid();

  insert into public.client_ondertekeningen
    (client_id, zorgplan_id, verklaring_type, ondertekenaar_type, ondertekenaar_naam,
     aangemaakt_door, aangemaakt_door_naam, body_override_html)
  values (v.client_id, v.id, 'zorgplan', p_ondertekenaar_type, btrim(p_ondertekenaar_naam),
     auth.uid(), coalesce(v_naam, 'Onbekend'), v_body)
  returning id, token into v_ond_id, v_token;

  update public.zorgplannen set status = 'ter_ondertekening', laatst_gewijzigd = now() where id = p_id;

  perform public.client_tijdlijn_log(v.client_id, 'zorgplan',
    'Zorgplan ter ondertekening',
    'Ondertekening aangevraagd voor ' || btrim(p_ondertekenaar_naam) || ' (' || p_ondertekenaar_type || ').',
    'zorgplannen', p_id::text);

  return jsonb_build_object('ok', true, 'ondertekening_id', v_ond_id, 'token', v_token);
end; $$;
revoke all on function public.zorgplan_ter_ondertekening(uuid, text, text) from public, anon;
grant execute on function public.zorgplan_ter_ondertekening(uuid, text, text) to authenticated;

-- Activeren zonder digitale ondertekening (bv. op papier getekend)
create or replace function public.zorgplan_activeer(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om een zorgplan te activeren';
  end if;
  select * into v from public.zorgplannen where id = p_id and not archived;
  if not found then raise exception 'Zorgplan niet gevonden'; end if;
  if v.status not in ('gw_akkoord','ter_ondertekening') then
    raise exception 'Zorgplan kan alleen geactiveerd worden na GW-akkoord (status: %)', v.status;
  end if;
  update public.client_ondertekeningen
     set status = 'ingetrokken', laatst_gewijzigd = now()
   where zorgplan_id = p_id and status = 'open';
  update public.zorgplannen
     set status = 'vervangen', vervangen_door = p_id, laatst_gewijzigd = now()
   where client_id = v.client_id and status = 'actief' and id <> p_id and not archived;
  update public.zorgplannen
     set status = 'actief', actief_sinds = now(), laatst_gewijzigd = now()
   where id = p_id;
  perform public.client_tijdlijn_log(v.client_id, 'zorgplan',
    'Zorgplan actief',
    'Het zorgplan "' || v.titel || '" is geactiveerd.',
    'zorgplannen', p_id::text);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.zorgplan_activeer(uuid) from public, anon;
grant execute on function public.zorgplan_activeer(uuid) to authenticated;

create or replace function public.zorgplan_evalueer(p_id uuid, p_verslag text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om een zorgplan te evalueren';
  end if;
  select * into v from public.zorgplannen where id = p_id and not archived;
  if not found then raise exception 'Zorgplan niet gevonden'; end if;
  if v.status <> 'actief' then
    raise exception 'Alleen een actief zorgplan kan geëvalueerd worden (status: %)', v.status;
  end if;
  update public.zorgplannen set
    status = 'geevalueerd', geevalueerd_op = now(),
    evaluatie_verslag = nullif(btrim(coalesce(p_verslag,'')), ''),
    laatst_gewijzigd = now()
  where id = p_id;
  perform public.client_tijdlijn_log(v.client_id, 'zorgplan',
    'Zorgplan geëvalueerd',
    'Het zorgplan "' || v.titel || '" is geëvalueerd.',
    'zorgplannen', p_id::text);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.zorgplan_evalueer(uuid, text) from public, anon;
grant execute on function public.zorgplan_evalueer(uuid, text) to authenticated;

create or replace function public.signaleringsplan_activeer(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om een signaleringsplan te activeren';
  end if;
  select * into v from public.signaleringsplannen where id = p_id and not archived;
  if not found then raise exception 'Signaleringsplan niet gevonden'; end if;
  if v.status <> 'concept' then
    raise exception 'Alleen een concept-signaleringsplan kan geactiveerd worden (status: %)', v.status;
  end if;
  update public.signaleringsplannen
     set status = 'vervangen', vervangen_door = p_id, laatst_gewijzigd = now()
   where client_id = v.client_id and status = 'actief' and id <> p_id and not archived;
  update public.signaleringsplannen
     set status = 'actief', actief_sinds = now(), laatst_gewijzigd = now()
   where id = p_id;
  perform public.client_tijdlijn_log(v.client_id, 'signaleringsplan',
    'Signaleringsplan actief',
    'Het signaleringsplan is geactiveerd.',
    'signaleringsplannen', p_id::text);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.signaleringsplan_activeer(uuid) from public, anon;
grant execute on function public.signaleringsplan_activeer(uuid) to authenticated;

-- ---------- 10. tijdlijn-triggers ----------
create or replace function public.tg_fase3_tijdlijn_zorgplan()
returns trigger language plpgsql security definer
set search_path to 'public'
as $$
begin
  perform public.client_tijdlijn_log(new.client_id, 'zorgplan',
    'Zorgplan aangemaakt (concept)',
    'Zorgplan "' || new.titel || '" is aangemaakt.',
    'zorgplannen', new.id::text);
  return new;
end; $$;
drop trigger if exists trg_zorgplannen_tijdlijn on public.zorgplannen;
create trigger trg_zorgplannen_tijdlijn after insert on public.zorgplannen
  for each row execute function public.tg_fase3_tijdlijn_zorgplan();

create or replace function public.tg_fase3_tijdlijn_signaleringsplan()
returns trigger language plpgsql security definer
set search_path to 'public'
as $$
begin
  perform public.client_tijdlijn_log(new.client_id, 'signaleringsplan',
    'Signaleringsplan aangemaakt (concept)', null,
    'signaleringsplannen', new.id::text);
  return new;
end; $$;
drop trigger if exists trg_signaleringsplannen_tijdlijn on public.signaleringsplannen;
create trigger trg_signaleringsplannen_tijdlijn after insert on public.signaleringsplannen
  for each row execute function public.tg_fase3_tijdlijn_signaleringsplan();

create or replace function public.tg_fase3_tijdlijn_rapportage()
returns trigger language plpgsql security definer
set search_path to 'public'
as $$
begin
  perform public.client_tijdlijn_log(new.client_id, 'rapportage',
    'Rapportage: ' || coalesce(nullif(btrim(new.titel), ''), 'zonder titel'),
    case when nullif(coalesce(new.type,''),'') is not null then 'Type: ' || new.type || '.' else null end,
    'client_rapportages', new.id::text);
  return new;
end; $$;
drop trigger if exists trg_client_rapportages_tijdlijn on public.client_rapportages;
create trigger trg_client_rapportages_tijdlijn after insert on public.client_rapportages
  for each row execute function public.tg_fase3_tijdlijn_rapportage();

create or replace function public.tg_fase3_tijdlijn_contactlog()
returns trigger language plpgsql security definer
set search_path to 'public'
as $$
begin
  perform public.client_tijdlijn_log(new.client_id, 'contact',
    'Contactmoment (' || new.type || ')',
    coalesce(nullif(btrim(new.onderwerp), ''), null),
    'client_contactlog', new.id::text);
  return new;
end; $$;
drop trigger if exists trg_client_contactlog_tijdlijn on public.client_contactlog;
create trigger trg_client_contactlog_tijdlijn after insert on public.client_contactlog
  for each row execute function public.tg_fase3_tijdlijn_contactlog();

create or replace function public.tg_fase3_tijdlijn_klacht()
returns trigger language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.client_id is not null and exists (select 1 from public.clienten c where c.id = new.client_id) then
    perform public.client_tijdlijn_log(new.client_id, 'klacht',
      'Klacht geregistreerd: ' || coalesce(nullif(btrim(new.onderwerp), ''), 'zonder onderwerp'),
      null, 'klachten', new.id::text);
  end if;
  return new;
end; $$;
drop trigger if exists trg_klachten_tijdlijn on public.klachten;
create trigger trg_klachten_tijdlijn after insert on public.klachten
  for each row execute function public.tg_fase3_tijdlijn_klacht();

create or replace function public.tg_fase3_tijdlijn_incident()
returns trigger language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.client_id is not null and exists (select 1 from public.clienten c where c.id = new.client_id) then
    perform public.client_tijdlijn_log(new.client_id, 'incident',
      'Incident gemeld' || case when nullif(coalesce(new.categorie,''),'') is not null then ': ' || new.categorie else '' end,
      null, 'incidenten', new.id::text);
  end if;
  return new;
end; $$;
drop trigger if exists trg_incidenten_tijdlijn on public.incidenten;
create trigger trg_incidenten_tijdlijn after insert on public.incidenten
  for each row execute function public.tg_fase3_tijdlijn_incident();

-- ---------- 11. AI-cliëntsamenvatting (deterministisch, §7) ----------
create or replace function public.client_ai_samenvatting(p_client_id text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_client public.clienten%rowtype;
  v_zp public.zorgplannen%rowtype;
  v_sp_actief boolean := false;
  v_besch_eind date; v_besch_dagen int;
  v_inc_30 int := 0; v_inc_90 int := 0; v_inc_laatste timestamptz; v_inc_topcat text;
  v_rap_laatste date; v_rap_type text;
  v_contact_laatste date;
  v_doelen_totaal int := 0; v_doelen_open int := 0; v_doelen_behaald int := 0;
  v_aandacht jsonb := '[]'::jsonb;
  v_actieve_groep boolean;
begin
  if not public.client_zorg_toegang(p_client_id) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  select * into v_client from public.clienten where id = p_client_id;
  if not found then return jsonb_build_object('ok', false, 'fout', 'onbekend'); end if;

  v_actieve_groep := coalesce(v_client.reis_status, '') in ('actief','tijdelijk_gepauzeerd');

  select * into v_zp from public.zorgplannen
   where client_id = p_client_id and status = 'actief' and not archived
   order by actief_sinds desc nulls last limit 1;

  if found and jsonb_typeof(v_zp.doelen) = 'array' then
    select count(*),
           count(*) filter (where coalesce(d->>'status','open') = 'open'),
           count(*) filter (where coalesce(d->>'status','') = 'behaald')
      into v_doelen_totaal, v_doelen_open, v_doelen_behaald
      from jsonb_array_elements(v_zp.doelen) d;
  end if;

  v_sp_actief := exists (
    select 1 from public.signaleringsplannen
    where client_id = p_client_id and status = 'actief' and not archived);

  select b.eind_iso, (b.eind_iso - current_date)
    into v_besch_eind, v_besch_dagen
    from public.beschikkingen b
   where b.client_id = p_client_id and not coalesce(b.gearchiveerd, false)
     and b.eind_iso is not null and b.eind_iso >= current_date
   order by b.eind_iso asc limit 1;

  select count(*) filter (where i.incident_datum >= now() - interval '30 days'),
         count(*) filter (where i.incident_datum >= now() - interval '90 days'),
         max(i.incident_datum)
    into v_inc_30, v_inc_90, v_inc_laatste
    from public.incidenten i
   where i.client_id = p_client_id and not coalesce(i.archived, false);

  select i.categorie into v_inc_topcat
    from public.incidenten i
   where i.client_id = p_client_id and not coalesce(i.archived, false)
     and i.incident_datum >= now() - interval '90 days'
   group by i.categorie order by count(*) desc nulls last limit 1;

  select r.rapport_datum, r.type into v_rap_laatste, v_rap_type
    from public.client_rapportages r
   where r.client_id = p_client_id and not coalesce(r.archived, false)
   order by r.rapport_datum desc nulls last limit 1;

  select c.datum into v_contact_laatste
    from public.client_contactlog c
   where c.client_id = p_client_id and not coalesce(c.archived, false)
   order by c.datum desc limit 1;

  -- Deterministische aandachtspunten
  if v_actieve_groep and v_zp.id is null then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'rood', 'tekst', 'Geen actief zorgplan');
  end if;
  if v_zp.id is not null and v_zp.evaluatiemoment is not null and v_zp.evaluatiemoment < current_date then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'rood',
      'tekst', 'Evaluatiemoment verstreken (' || to_char(v_zp.evaluatiemoment, 'DD-MM-YYYY') || ')');
  elsif v_zp.id is not null and v_zp.evaluatiemoment is not null and v_zp.evaluatiemoment <= current_date + 30 then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'oranje',
      'tekst', 'Evaluatie gepland op ' || to_char(v_zp.evaluatiemoment, 'DD-MM-YYYY'));
  end if;
  if v_actieve_groep and not v_sp_actief then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'oranje', 'tekst', 'Geen actief signaleringsplan');
  end if;
  if v_actieve_groep and v_besch_eind is null then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'rood', 'tekst', 'Geen lopende beschikking');
  elsif v_besch_eind is not null and v_besch_dagen <= 60 then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', case when v_besch_dagen <= 30 then 'rood' else 'oranje' end,
      'tekst', 'Beschikking verloopt over ' || v_besch_dagen || ' dagen (' || to_char(v_besch_eind, 'DD-MM-YYYY') || ')');
  end if;
  if v_inc_30 >= 3 then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'rood',
      'tekst', v_inc_30 || ' incidenten in de afgelopen 30 dagen');
  elsif v_inc_30 > 0 then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'oranje',
      'tekst', v_inc_30 || ' incident(en) in de afgelopen 30 dagen');
  end if;
  if v_actieve_groep and (v_rap_laatste is null or v_rap_laatste < current_date - 14) then
    v_aandacht := v_aandacht || jsonb_build_object('ernst', 'oranje',
      'tekst', case when v_rap_laatste is null then 'Nog geen rapportages'
        else 'Geen rapportage sinds ' || to_char(v_rap_laatste, 'DD-MM-YYYY') end);
  end if;

  return jsonb_build_object(
    'ok', true,
    'reis_status', v_client.reis_status,
    'zorgplan', case when v_zp.id is null then null else jsonb_build_object(
      'id', v_zp.id, 'titel', v_zp.titel, 'hulpvraag', v_zp.hulpvraag,
      'evaluatiemoment', v_zp.evaluatiemoment, 'actief_sinds', v_zp.actief_sinds,
      'doelen_totaal', v_doelen_totaal, 'doelen_open', v_doelen_open, 'doelen_behaald', v_doelen_behaald) end,
    'signaleringsplan_actief', v_sp_actief,
    'beschikking', case when v_besch_eind is null then null else jsonb_build_object(
      'eind', v_besch_eind, 'dagen_resterend', v_besch_dagen) end,
    'incidenten', jsonb_build_object(
      'laatste_30d', coalesce(v_inc_30, 0), 'laatste_90d', coalesce(v_inc_90, 0),
      'laatste_datum', v_inc_laatste, 'top_categorie', v_inc_topcat),
    'laatste_rapportage', case when v_rap_laatste is null then null else jsonb_build_object(
      'datum', v_rap_laatste, 'type', v_rap_type) end,
    'laatste_contact', v_contact_laatste,
    'aandachtspunten', v_aandacht);
end; $$;
revoke all on function public.client_ai_samenvatting(text) from public, anon;
grant execute on function public.client_ai_samenvatting(text) to authenticated;

-- ---------- 12. clienten-RLS: gekoppelde medewerker ziet het dossier ----------
drop policy if exists "clienten_select_begeleider_of_hr" on public.clienten;
create policy "clienten_select_begeleider_of_hr"
  on public.clienten for select to authenticated
  using (
    is_admin(auth.uid()) or is_hr() or (
      is_begeleider() and (
        is_office_clientviewer()
        or (locatie in (select public.current_user_medewerker_locatie_namen()))
        or (id in (select public.current_user_gekoppelde_client_ids()))
      )
    )
  );
