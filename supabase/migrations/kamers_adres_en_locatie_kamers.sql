-- ============================================================================
-- Kamers: per-kamer adres + locatie-gekoppelde kamer-aanmaak.
-- ============================================================================
-- Idempotent. Toepasbaar via:
--   node scripts/db-exec.mjs --file supabase/migrations/kamers_adres_en_locatie_kamers.sql
--
-- Doel (user-wens 2026-06-11):
--   1. Elke kamer kan een eigen, specifiek adres krijgen (los van de locatie).
--   2. Bij het aanmaken van een nieuwe locatie worden direct kamers meegegeven
--      (verplicht ≥1), met per kamer een naam + optioneel adres. Die verschijnen
--      meteen in het bezettingsoverzicht (koppeling via locatie-NAAM, ongewijzigd).
--
-- Wijzigingen:
--   - public.kamers krijgt kolom `adres text`.
--   - bezetting_kamer_upsert(...) krijgt extra parameter p_adres.
--   - bezetting_overzicht() geeft per kamer ook `adres` terug.
--   - nieuwe RPC bezetting_kamers_aanmaken(p_locatie, p_kamers jsonb) maakt een
--     reeks benoemde kamers (met optioneel adres) voor één bestaande locatie aan.
--   - can_beheer_kamers() krijgt 'hr' erbij: HR beheert de Locatie-module en moet
--     daardoor de (nu verplichte) kamers van een nieuwe locatie kunnen aanmaken.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kolom: per-kamer adres
-- ----------------------------------------------------------------------------
alter table public.kamers add column if not exists adres text;

comment on column public.kamers.adres is
  'Optioneel specifiek adres van deze kamer/plek (los van de locatie). Leeg = valt onder het locatie-adres.';

-- ----------------------------------------------------------------------------
-- 2. Rol-gate: HR mag kamers beheren (beheert de Locatie-module).
-- ----------------------------------------------------------------------------
create or replace function public.can_beheer_kamers()
 returns boolean language sql stable security definer
 set search_path to 'pg_catalog','public'
as $$
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = auth.uid() and r.slug in
      ('admin','eigenaar','directeur','facilitair','planner','teamleider','hr')
  ) or exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Hoofd-RPC: bezettingsoverzicht — nu inclusief per-kamer adres.
--    (Volledige herdefinitie; alleen `adres` is toegevoegd t.o.v. de basis.)
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
           km.schoonmaak_status, km.status_notitie, km.notitie, km.adres, km.volgorde,
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
      'notitie', notitie, 'adres', adres, 'volgorde', volgorde,
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
-- 4. Kamer toevoegen/bewerken — nu met p_adres.
--    Oude signatuur droppen (parameter toegevoegd → andere signatuur).
-- ----------------------------------------------------------------------------
drop function if exists public.bezetting_kamer_upsert(uuid,text,text,text,integer,integer,text);

create or replace function public.bezetting_kamer_upsert(
  p_id uuid, p_locatie text, p_nummer text, p_verdieping text,
  p_capaciteit integer, p_volgorde integer, p_notitie text, p_adres text default null)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_loc text := nullif(btrim(coalesce(p_locatie,'')), '');
  v_nr  text := nullif(btrim(coalesce(p_nummer,'')), '');
  v_adr text := nullif(btrim(coalesce(p_adres,'')), '');
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
    insert into public.kamers (locatie_naam, nummer, verdieping, capaciteit, volgorde, notitie, adres)
    values (v_loc, v_nr, nullif(btrim(coalesce(p_verdieping,'')),''), v_cap, coalesce(p_volgorde,0),
            nullif(btrim(coalesce(p_notitie,'')),''), v_adr)
    returning id into v_id;
  else
    update public.kamers set
      locatie_naam = v_loc, nummer = v_nr,
      verdieping = nullif(btrim(coalesce(p_verdieping,'')),''),
      capaciteit = v_cap, volgorde = coalesce(p_volgorde, volgorde),
      notitie = nullif(btrim(coalesce(p_notitie,'')),''),
      adres = v_adr
    where id = p_id and not archived
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'Kamer niet gevonden.'); end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Nieuwe RPC: benoemde kamers (met optioneel adres) voor één locatie aanmaken.
--    p_kamers = jsonb-array van objecten: {nummer, adres?, capaciteit?, verdieping?}.
--    Lege/dubbele kamernamen worden overgeslagen. Gebruikt door de Locatie-toevoegen-
--    flow zodat een nieuwe locatie meteen haar kamers in het bezettingsoverzicht heeft.
-- ----------------------------------------------------------------------------
create or replace function public.bezetting_kamers_aanmaken(
  p_locatie text, p_kamers jsonb)
returns jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_loc text := nullif(btrim(coalesce(p_locatie,'')), '');
  v_basis integer;
  v_made integer := 0;
  v_count integer := 0;
  v_elem jsonb;
  v_nr text;
  v_adr text;
  v_verd text;
  v_cap integer;
begin
  if not public.can_beheer_kamers() then return jsonb_build_object('unauthorized', true); end if;
  if v_loc is null then return jsonb_build_object('ok', false, 'error', 'Geen locatie opgegeven.'); end if;
  if p_kamers is null or jsonb_typeof(p_kamers) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Geen kamers opgegeven.');
  end if;
  v_count := jsonb_array_length(p_kamers);
  if v_count < 1 then return jsonb_build_object('ok', false, 'error', 'Geef minstens één kamer op.'); end if;
  if v_count > 200 then return jsonb_build_object('ok', false, 'error', 'Maximaal 200 kamers per keer.'); end if;
  if not exists (select 1 from public.locaties l where l.naam = v_loc and not l.archived) then
    return jsonb_build_object('ok', false, 'error', 'Onbekende locatie: ' || v_loc);
  end if;

  select coalesce(max(volgorde), 0) into v_basis
  from public.kamers where lower(locatie_naam) = lower(v_loc) and not archived;

  for v_elem in select * from jsonb_array_elements(p_kamers) loop
    v_nr  := nullif(btrim(coalesce(v_elem->>'nummer','')), '');
    v_adr := nullif(btrim(coalesce(v_elem->>'adres','')), '');
    v_verd := nullif(btrim(coalesce(v_elem->>'verdieping','')), '');
    v_cap := coalesce((v_elem->>'capaciteit')::integer, 1);
    if v_cap < 1 then v_cap := 1; end if;
    if v_cap > 50 then v_cap := 50; end if;
    if v_nr is null then continue; end if;          -- lege kamernaam overslaan
    if exists (
      select 1 from public.kamers km
      where lower(km.locatie_naam) = lower(v_loc) and lower(km.nummer) = lower(v_nr) and not km.archived
    ) then
      continue;                                       -- dubbele kamernaam overslaan
    end if;
    insert into public.kamers (locatie_naam, nummer, verdieping, capaciteit, volgorde, adres)
    values (v_loc, v_nr, v_verd, v_cap, v_basis + v_made + 1, v_adr);
    v_made := v_made + 1;
  end loop;

  return jsonb_build_object('ok', true, 'aangemaakt', v_made, 'gevraagd', v_count);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------
grant execute on function public.bezetting_kamer_upsert(uuid,text,text,text,integer,integer,text,text) to authenticated;
grant execute on function public.bezetting_kamers_aanmaken(text,jsonb) to authenticated;
