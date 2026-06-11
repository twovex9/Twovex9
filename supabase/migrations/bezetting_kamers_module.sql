-- ============================================================================
-- Bezetting & Kamerbeheer-module — hotel-stijl bezettingslijst.
-- ============================================================================
-- Idempotent. Toepasbaar via:
--   node scripts/db-exec.mjs --file supabase/migrations/bezetting_kamers_module.sql
--
-- Doel: real-time bezettingsoverzicht van woonlocaties op kamerniveau.
--   - public.kamers              : individuele kamers/bedden per locatie (capaciteit).
--   - public.kamer_toewijzingen  : welke cliënt op welke kamer (met historie).
-- Bezetting (vol/deels/vrij) = afgeleid uit actieve toewijzingen (einddatum is null).
-- Schoonmaak/onderhoud (gereed/schoonmaak_nodig/onderhoud_nodig/buiten_gebruik) =
--   handmatige operationele vlag (housekeeping/facilitair), los van bezetting.
--
-- Locatiekoppeling via canonieke locatie-NAAM (public.locaties.naam ↔ clienten.locatie),
-- consistent met financien_locatie_kamers.sql — GEEN parallel koppel-systeem.
--
-- Toegang (server-side, SECURITY DEFINER):
--   can_view_bezetting()     : alle kantoor/zorg-rollen (lezen).
--   can_beheer_kamers()      : kamers TOEVOEGEN / bewerken / archiveren (capaciteit, verdieping)
--                              — alleen admin-tier (Eigenaar/Admin/Directeur) + Zorgcoördinator.
--                              (Eigenaar-besluit 2026-06-11: kamerbeheer = enkel deze rollen.)
--   can_kamers_status()      : housekeeping/schoonmaak-status zetten (gereed/schoonmaak/onderhoud/
--                              buiten gebruik) — admin-tier + Facilitair + Planner + Zorgcoördinator
--                              (Facilitair houdt zo z'n housekeeping-taak, zonder kamers te kunnen
--                              toevoegen/verwijderen).
--   can_toewijzen_clienten() : cliënt↔kamer koppelen/verplaatsen
--                              (admin-tier + Zorgcoördinator + Gedragswetenschapper + Cliëntbeheer).
-- Rolbron = bs2_role_users (email-match) → bs2_roles.slug (idem is_office_staff /
-- can_view_financien). Let op slug-afwijkingen: Zorgcoördinator=teamleider,
-- Cliëntbeheer=beschikkingen-test.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabellen
-- ----------------------------------------------------------------------------
create table if not exists public.kamers (
  id uuid primary key default gen_random_uuid(),
  locatie_naam text not null,
  nummer text not null,
  verdieping text,
  capaciteit integer not null default 1,
  schoonmaak_status text not null default 'gereed',
  status_notitie text,
  notitie text,
  volgorde integer not null default 0,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  constraint kamers_capaciteit_chk check (capaciteit >= 1 and capaciteit <= 50),
  constraint kamers_status_chk check (schoonmaak_status in ('gereed','schoonmaak_nodig','onderhoud_nodig','buiten_gebruik'))
);

comment on table public.kamers is
  'Kamers/bedden per woonlocatie (capaciteit). Bezetting = afgeleid uit kamer_toewijzingen. schoonmaak_status = handmatige housekeeping/facilitair-vlag.';

create unique index if not exists kamers_locatie_nummer_uniek
  on public.kamers (lower(locatie_naam), lower(nummer)) where not archived;
create index if not exists kamers_locatie_idx on public.kamers (lower(locatie_naam)) where not archived;
create index if not exists kamers_status_idx on public.kamers (schoonmaak_status) where not archived;

drop trigger if exists trg_kamers_set_modified on public.kamers;
create trigger trg_kamers_set_modified
  before update on public.kamers
  for each row execute function public.set_laatst_gewijzigd();

create table if not exists public.kamer_toewijzingen (
  id uuid primary key default gen_random_uuid(),
  kamer_id uuid not null references public.kamers(id) on delete cascade,
  client_id text not null references public.clienten(id) on delete cascade,
  ingangsdatum date not null default current_date,
  einddatum date,
  notitie text,
  aangemaakt_door text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

comment on table public.kamer_toewijzingen is
  'Cliënt↔kamer-toewijzingen. einddatum NULL = actuele bewoning. Historie blijft bewaard.';

-- Eén cliënt kan maar op één kamer tegelijk wonen.
create unique index if not exists kamer_toewijzing_client_actief_uniek
  on public.kamer_toewijzingen (client_id) where einddatum is null;
create index if not exists kamer_toewijzing_kamer_actief_idx
  on public.kamer_toewijzingen (kamer_id) where einddatum is null;

drop trigger if exists trg_kamer_toewijzingen_set_modified on public.kamer_toewijzingen;
create trigger trg_kamer_toewijzingen_set_modified
  before update on public.kamer_toewijzingen
  for each row execute function public.set_laatst_gewijzigd();

-- ----------------------------------------------------------------------------
-- 2. RLS — SELECT open voor authenticated (nodig voor reads + Realtime);
--    schrijven kan ALLEEN via de SECURITY DEFINER-RPC's hieronder (geen
--    directe write-policy → directe PostgREST-writes worden geweigerd).
-- ----------------------------------------------------------------------------
alter table public.kamers enable row level security;
drop policy if exists "auth kan kamers lezen" on public.kamers;
create policy "auth kan kamers lezen" on public.kamers for select to authenticated using (true);

alter table public.kamer_toewijzingen enable row level security;
drop policy if exists "auth kan kamer_toewijzingen lezen" on public.kamer_toewijzingen;
create policy "auth kan kamer_toewijzingen lezen" on public.kamer_toewijzingen for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 3. Rol-gates
-- ----------------------------------------------------------------------------
create or replace function public.can_view_bezetting()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in
      ('admin','eigenaar','directeur','teamleider','gedragswetenschapper',
       'beschikkingen-test','planner','facilitair','hr','finance','beleid','salarisadministratie')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- Kamers toevoegen / bewerken / archiveren — beperkt tot admin-tier + Zorgcoördinator.
-- (Eigenaar-besluit 2026-06-11: Facilitair/Planner mogen GEEN kamers meer toevoegen/verwijderen.)
create or replace function public.can_beheer_kamers()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in
      ('admin','eigenaar','directeur','teamleider')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- Housekeeping/schoonmaak-status zetten — bredere set zodat Facilitair (en Planner) hun
-- onderhoud/schoonmaak-taak houden, ZONDER kamers te kunnen toevoegen/verwijderen.
create or replace function public.can_kamers_status()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in
      ('admin','eigenaar','directeur','facilitair','planner','teamleider')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

create or replace function public.can_toewijzen_clienten()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in
      ('admin','eigenaar','directeur','teamleider','gedragswetenschapper','beschikkingen-test')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. Hoofd-RPC: bezettingsoverzicht (totalen + per locatie + per kamer +
--    toewijsbare cliënten + locatielijst). Eén round-trip voor de hele pagina.
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_overzicht()
returns jsonb language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare v_result jsonb;
begin
  if not public.can_view_bezetting() then
    return jsonb_build_object('unauthorized', true);
  end if;

  with
  loc_color as (
    select naam, min(kleur) as kleur
    from public.locaties where not archived and naam is not null and naam <> ''
    group by naam
  ),
  actief as (
    select t.id as toewijzing_id, t.kamer_id, t.client_id, t.ingangsdatum,
           trim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')) as naam,
           c.clientnummer
    from public.kamer_toewijzingen t
    join public.clienten c on c.id = t.client_id
    where t.einddatum is null and not c.archived
  ),
  kamer_bew as (
    select kamer_id, count(*)::int as aantal,
           jsonb_agg(jsonb_build_object(
             'toewijzing_id', toewijzing_id, 'client_id', client_id,
             'naam', naam, 'clientnummer', clientnummer, 'ingangsdatum', ingangsdatum
           ) order by naam) as bewoners
    from actief group by kamer_id
  ),
  k as (
    select km.id, km.locatie_naam, km.nummer, km.verdieping, km.capaciteit,
           km.schoonmaak_status, km.status_notitie, km.notitie, km.volgorde,
           coalesce(lc.kleur, '#64748b') as kleur,
           coalesce(kb.aantal, 0) as aantal_bewoners,
           coalesce(kb.bewoners, '[]'::jsonb) as bewoners,
           greatest(km.capaciteit - coalesce(kb.aantal, 0), 0) as vrije_plekken,
           case
             when km.schoonmaak_status = 'buiten_gebruik' then 'buiten_gebruik'
             when coalesce(kb.aantal, 0) >= km.capaciteit then 'vol'
             when coalesce(kb.aantal, 0) > 0 then 'deels_bezet'
             when km.schoonmaak_status = 'schoonmaak_nodig' then 'schoonmaak_nodig'
             when km.schoonmaak_status = 'onderhoud_nodig' then 'onderhoud_nodig'
             else 'vrij'
           end as effectieve_status
    from public.kamers km
    left join loc_color lc on lc.naam = km.locatie_naam
    left join kamer_bew kb on kb.kamer_id = km.id
    where not km.archived
  ),
  kamers_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'locatie_naam', locatie_naam, 'kleur', kleur,
      'nummer', nummer, 'verdieping', verdieping, 'capaciteit', capaciteit,
      'schoonmaak_status', schoonmaak_status, 'status_notitie', status_notitie,
      'notitie', notitie, 'volgorde', volgorde,
      'aantal_bewoners', aantal_bewoners, 'vrije_plekken', vrije_plekken,
      'bewoners', bewoners, 'effectieve_status', effectieve_status
    ) order by locatie_naam, volgorde, nummer), '[]'::jsonb) as js
    from k
  ),
  per_loc as (
    select locatie_naam, max(kleur) as kleur,
      count(*)::int as kamers,
      sum(capaciteit)::int as capaciteit,
      sum(aantal_bewoners)::int as bezette_bedden,
      sum(vrije_plekken)::int as vrije_bedden,
      count(*) filter (where aantal_bewoners > 0)::int as bezette_kamers,
      count(*) filter (where aantal_bewoners = 0 and effectieve_status = 'vrij')::int as vrije_kamers,
      count(*) filter (where schoonmaak_status = 'schoonmaak_nodig')::int as schoonmaak_nodig,
      count(*) filter (where schoonmaak_status = 'onderhoud_nodig')::int as onderhoud_nodig,
      count(*) filter (where schoonmaak_status = 'buiten_gebruik')::int as buiten_gebruik
    from k group by locatie_naam
  ),
  per_loc_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'locatie', locatie_naam, 'kleur', kleur, 'kamers', kamers,
      'capaciteit', capaciteit, 'bezette_bedden', bezette_bedden, 'vrije_bedden', vrije_bedden,
      'bezette_kamers', bezette_kamers, 'vrije_kamers', vrije_kamers,
      'schoonmaak_nodig', schoonmaak_nodig, 'onderhoud_nodig', onderhoud_nodig,
      'buiten_gebruik', buiten_gebruik,
      'bezettingsgraad_pct', case when capaciteit > 0 then round(bezette_bedden::numeric / capaciteit * 100) else 0 end
    ) order by locatie_naam), '[]'::jsonb) as js
    from per_loc
  ),
  in_zorg as (
    select c.id, trim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')) as naam,
           c.clientnummer, c.locatie, c.fase
    from public.clienten c
    where not c.archived and lower(btrim(coalesce(c.fase,''))) = 'in zorg'
  ),
  client_kamer as (
    select a.client_id, a.kamer_id, km.locatie_naam, km.nummer
    from actief a join public.kamers km on km.id = a.kamer_id
  ),
  toewijsbaar as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', iz.id, 'naam', iz.naam, 'clientnummer', iz.clientnummer,
      'locatie', iz.locatie, 'fase', iz.fase,
      'huidige_kamer_id', ck.kamer_id,
      'huidige_kamer_label', case when ck.kamer_id is not null
        then ck.locatie_naam || ' · ' || ck.nummer else null end
    ) order by lower(iz.naam)), '[]'::jsonb) as js
    from in_zorg iz left join client_kamer ck on ck.client_id = iz.id
  ),
  zonder_kamer as (
    select count(*)::int as n from in_zorg iz
    left join client_kamer ck on ck.client_id = iz.id
    where ck.kamer_id is null
  ),
  loc_list as (
    select coalesce(jsonb_agg(jsonb_build_object('naam', naam, 'kleur', kleur) order by naam), '[]'::jsonb) as js
    from loc_color
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'kamers', count(*),
        'capaciteit', coalesce(sum(capaciteit), 0),
        'bezette_bedden', coalesce(sum(aantal_bewoners), 0),
        'vrije_bedden', coalesce(sum(vrije_plekken), 0),
        'bezette_kamers', count(*) filter (where aantal_bewoners > 0),
        'vrije_kamers', count(*) filter (where aantal_bewoners = 0 and effectieve_status = 'vrij'),
        'deels_bezet', count(*) filter (where effectieve_status = 'deels_bezet'),
        'schoonmaak_nodig', count(*) filter (where schoonmaak_status = 'schoonmaak_nodig'),
        'onderhoud_nodig', count(*) filter (where schoonmaak_status = 'onderhoud_nodig'),
        'buiten_gebruik', count(*) filter (where schoonmaak_status = 'buiten_gebruik'),
        'bezettingsgraad_pct', case when coalesce(sum(capaciteit),0) > 0
            then round(sum(aantal_bewoners)::numeric / sum(capaciteit) * 100) else 0 end,
        'in_zorg_totaal', (select count(*) from in_zorg),
        'clienten_zonder_kamer', (select n from zonder_kamer)
      ) from k),
    'per_locatie', (select js from per_loc_json),
    'kamers', (select js from kamers_json),
    'toewijsbare_clienten', (select js from toewijsbaar),
    'locaties', (select js from loc_list)
  ) into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Kamer toevoegen/bewerken (één kamer).
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_kamer_upsert(
  p_id uuid, p_locatie text, p_nummer text, p_verdieping text,
  p_capaciteit integer, p_volgorde integer, p_notitie text)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_loc text := nullif(btrim(coalesce(p_locatie,'')), '');
  v_nr  text := nullif(btrim(coalesce(p_nummer,'')), '');
  v_cap integer := coalesce(p_capaciteit, 1);
  v_id  uuid;
begin
  if not public.can_beheer_kamers() then return jsonb_build_object('unauthorized', true); end if;
  if v_loc is null then return jsonb_build_object('ok', false, 'error', 'Geen locatie opgegeven.'); end if;
  if v_nr  is null then return jsonb_build_object('ok', false, 'error', 'Geen kamernummer opgegeven.'); end if;
  if v_cap < 1 or v_cap > 50 then return jsonb_build_object('ok', false, 'error', 'Capaciteit moet tussen 1 en 50 liggen.'); end if;
  if not exists (select 1 from public.locaties l where l.naam = v_loc and not l.archived) then
    return jsonb_build_object('ok', false, 'error', 'Onbekende locatie: ' || v_loc);
  end if;
  -- Dubbel kamernummer per locatie voorkomen.
  if exists (
    select 1 from public.kamers km
    where lower(km.locatie_naam) = lower(v_loc) and lower(km.nummer) = lower(v_nr)
      and not km.archived and (p_id is null or km.id <> p_id)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Kamer "' || v_nr || '" bestaat al op ' || v_loc || '.');
  end if;

  if p_id is null then
    insert into public.kamers (locatie_naam, nummer, verdieping, capaciteit, volgorde, notitie)
    values (v_loc, v_nr, nullif(btrim(coalesce(p_verdieping,'')),''), v_cap, coalesce(p_volgorde,0),
            nullif(btrim(coalesce(p_notitie,'')),''))
    returning id into v_id;
  else
    update public.kamers set
      locatie_naam = v_loc, nummer = v_nr,
      verdieping = nullif(btrim(coalesce(p_verdieping,'')),''),
      capaciteit = v_cap, volgorde = coalesce(p_volgorde, volgorde),
      notitie = nullif(btrim(coalesce(p_notitie,'')),'')
    where id = p_id and not archived
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'Kamer niet gevonden.'); end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Meerdere kamers in één keer aanmaken (snelle inrichting van een locatie).
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_kamers_bulk(
  p_locatie text, p_aantal integer, p_start integer default 1,
  p_prefix text default 'Kamer ', p_capaciteit integer default 1)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_loc text := nullif(btrim(coalesce(p_locatie,'')), '');
  v_cap integer := coalesce(p_capaciteit, 1);
  v_start integer := coalesce(p_start, 1);
  v_prefix text := coalesce(p_prefix, '');
  v_i integer;
  v_nr text;
  v_made integer := 0;
  v_basis integer;
begin
  if not public.can_beheer_kamers() then return jsonb_build_object('unauthorized', true); end if;
  if v_loc is null then return jsonb_build_object('ok', false, 'error', 'Geen locatie opgegeven.'); end if;
  if p_aantal is null or p_aantal < 1 or p_aantal > 200 then
    return jsonb_build_object('ok', false, 'error', 'Aantal moet tussen 1 en 200 liggen.');
  end if;
  if v_cap < 1 or v_cap > 50 then return jsonb_build_object('ok', false, 'error', 'Capaciteit moet tussen 1 en 50 liggen.'); end if;
  if not exists (select 1 from public.locaties l where l.naam = v_loc and not l.archived) then
    return jsonb_build_object('ok', false, 'error', 'Onbekende locatie: ' || v_loc);
  end if;

  select coalesce(max(volgorde), 0) into v_basis
  from public.kamers where lower(locatie_naam) = lower(v_loc) and not archived;

  for v_i in 0 .. (p_aantal - 1) loop
    v_nr := btrim(v_prefix || (v_start + v_i)::text);
    if not exists (
      select 1 from public.kamers km
      where lower(km.locatie_naam) = lower(v_loc) and lower(km.nummer) = lower(v_nr) and not km.archived
    ) then
      insert into public.kamers (locatie_naam, nummer, capaciteit, volgorde)
      values (v_loc, v_nr, v_cap, v_basis + v_i + 1);
      v_made := v_made + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'aangemaakt', v_made, 'gevraagd', p_aantal);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Kamer archiveren / herstellen.
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_kamer_archiveren(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare v_bezet integer;
begin
  if not public.can_beheer_kamers() then return jsonb_build_object('unauthorized', true); end if;
  if p_id is null then return jsonb_build_object('ok', false, 'error', 'Geen kamer opgegeven.'); end if;
  select count(*) into v_bezet from public.kamer_toewijzingen where kamer_id = p_id and einddatum is null;
  if v_bezet > 0 then
    return jsonb_build_object('ok', false, 'error', 'Kamer is bezet — ontkoppel eerst de bewoner(s).');
  end if;
  update public.kamers set archived = true where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.bezetting_kamer_herstellen(p_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
begin
  if not public.can_beheer_kamers() then return jsonb_build_object('unauthorized', true); end if;
  if p_id is null then return jsonb_build_object('ok', false, 'error', 'Geen kamer opgegeven.'); end if;
  update public.kamers set archived = false where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Housekeeping/facilitair-status zetten.
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_zet_status(p_kamer_id uuid, p_status text, p_notitie text)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare v_n integer;
begin
  if not public.can_kamers_status() then return jsonb_build_object('unauthorized', true); end if;
  if p_kamer_id is null then return jsonb_build_object('ok', false, 'error', 'Geen kamer opgegeven.'); end if;
  if p_status not in ('gereed','schoonmaak_nodig','onderhoud_nodig','buiten_gebruik') then
    return jsonb_build_object('ok', false, 'error', 'Onbekende status: ' || coalesce(p_status,'(leeg)'));
  end if;
  update public.kamers
     set schoonmaak_status = p_status,
         status_notitie = nullif(btrim(coalesce(p_notitie,'')), '')
   where id = p_kamer_id and not archived;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'status', p_status);
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Cliënt aan kamer toewijzen / verplaatsen. Beëindigt automatisch een
--    bestaande actieve toewijzing van dezelfde cliënt en synct clienten.locatie.
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_wijs_toe(
  p_kamer_id uuid, p_client_id text, p_ingangsdatum date, p_notitie text)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_loc text;
  v_cap integer;
  v_status text;
  v_bezet integer;
  v_email text;
begin
  if not public.can_toewijzen_clienten() then return jsonb_build_object('unauthorized', true); end if;
  if p_kamer_id is null then return jsonb_build_object('ok', false, 'error', 'Geen kamer opgegeven.'); end if;
  if p_client_id is null or btrim(p_client_id) = '' then return jsonb_build_object('ok', false, 'error', 'Geen cliënt opgegeven.'); end if;

  select locatie_naam, capaciteit, schoonmaak_status into v_loc, v_cap, v_status
  from public.kamers where id = p_kamer_id and not archived;
  if v_loc is null then return jsonb_build_object('ok', false, 'error', 'Kamer niet gevonden.'); end if;
  if v_status = 'buiten_gebruik' then
    return jsonb_build_object('ok', false, 'error', 'Kamer staat op "buiten gebruik".');
  end if;
  if not exists (select 1 from public.clienten c where c.id = p_client_id and not c.archived) then
    return jsonb_build_object('ok', false, 'error', 'Cliënt niet gevonden.');
  end if;

  -- Capaciteit checken (exclusief een eventuele bestaande toewijzing van deze cliënt op DEZE kamer).
  select count(*) into v_bezet from public.kamer_toewijzingen
   where kamer_id = p_kamer_id and einddatum is null and client_id <> p_client_id;
  if v_bezet >= v_cap then
    return jsonb_build_object('ok', false, 'error', 'Kamer is vol (' || v_cap || ' plek(ken) bezet).');
  end if;

  -- Al actief op precies deze kamer? Dan klaar (idempotent).
  if exists (select 1 from public.kamer_toewijzingen
             where kamer_id = p_kamer_id and client_id = p_client_id and einddatum is null) then
    update public.clienten set locatie = v_loc where id = p_client_id and coalesce(locatie,'') <> v_loc;
    return jsonb_build_object('ok', true, 'onveranderd', true);
  end if;

  -- Lopende toewijzing(en) van deze cliënt beëindigen (verplaatsing).
  update public.kamer_toewijzingen
     set einddatum = current_date
   where client_id = p_client_id and einddatum is null;

  begin
    v_email := (select email from auth.users where id = auth.uid());
  exception when others then v_email := null;
  end;

  insert into public.kamer_toewijzingen (kamer_id, client_id, ingangsdatum, notitie, aangemaakt_door)
  values (p_kamer_id, p_client_id, coalesce(p_ingangsdatum, current_date),
          nullif(btrim(coalesce(p_notitie,'')), ''), v_email);

  -- Locatie van de cliënt mee laten lopen met de kamer (één bron van waarheid).
  update public.clienten set locatie = v_loc where id = p_client_id and coalesce(locatie,'') <> v_loc;

  return jsonb_build_object('ok', true, 'locatie', v_loc);
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Cliënt van zijn kamer ontkoppelen (locatie blijft ongewijzigd).
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_ontkoppel(p_client_id text)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare v_n integer;
begin
  if not public.can_toewijzen_clienten() then return jsonb_build_object('unauthorized', true); end if;
  if p_client_id is null or btrim(p_client_id) = '' then return jsonb_build_object('ok', false, 'error', 'Geen cliënt opgegeven.'); end if;
  update public.kamer_toewijzingen set einddatum = current_date
   where client_id = p_client_id and einddatum is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'ontkoppeld', v_n);
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. Grants
-- ----------------------------------------------------------------------------
grant execute on function public.can_view_bezetting() to authenticated;
grant execute on function public.can_beheer_kamers() to authenticated;
grant execute on function public.can_kamers_status() to authenticated;
grant execute on function public.can_toewijzen_clienten() to authenticated;
grant execute on function public.bezetting_overzicht() to authenticated;
grant execute on function public.bezetting_kamer_upsert(uuid,text,text,text,integer,integer,text) to authenticated;
grant execute on function public.bezetting_kamers_bulk(text,integer,integer,text,integer) to authenticated;
grant execute on function public.bezetting_kamer_archiveren(uuid) to authenticated;
grant execute on function public.bezetting_kamer_herstellen(uuid) to authenticated;
grant execute on function public.bezetting_zet_status(uuid,text,text) to authenticated;
grant execute on function public.bezetting_wijs_toe(uuid,text,date,text) to authenticated;
grant execute on function public.bezetting_ontkoppel(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 12. Realtime — multi-user live-sync (idempotent toevoegen aan publication).
-- ----------------------------------------------------------------------------
do $do$
declare tbl text;
  tabellen text[] := array['kamers','kamer_toewijzingen'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach tbl in array tabellen loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$do$;
