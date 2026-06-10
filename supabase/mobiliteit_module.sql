-- ============================================================================
-- ETF Mobiliteit & Kilometerregistratie — module-uitbreiding (2026-06-10)
-- ============================================================================
-- Bouwt voort op km_auto_vergoeding.sql + migrations/werkwerk_kilometers.sql.
-- Voegt toe:
--   1) Zakelijke-rit-velden op kilometer_records (vertrek/bestemming/cliënt/reden
--      + km_berekend voor route-afwijkingdetectie).
--   2) km_checkins            — GPS web-check-in (datum/tijd/positie + afstand
--                               tot verwachte werklocatie + status).
--   3) km_signaal_config      — drempelwaarden voor de AI-signaleringen.
--   4) km_signaleringen       — gedetecteerde anomalieën (deterministische
--                               heuristiek, GEEN LLM), met HR-afhandeling.
--   5) km_genereer_signaleringen()  — SECURITY DEFINER engine (idempotent).
--   6) Dashboard-RPC's (SECURITY DEFINER) voor Financieel/Eigenaar/Planning/HR:
--        km_dash_totalen, km_dash_per_locatie, km_dash_per_client,
--        km_dash_per_medewerker, km_dash_tijdreeks, km_planning_reiskosten,
--        km_hr_controle.
--
-- Idempotent (create ... if not exists / create or replace / drop policy if exists).
-- DIEHARD: voegt alleen toe; raakt bestaande data niet aan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Zakelijke-rit-velden op kilometer_records
-- ----------------------------------------------------------------------------
-- Een zakelijke (werk-werk) rit krijgt nu vertrek-/bestemmingsadres, een
-- cliëntkoppeling (client_id text → clienten.id is TEXT), een locatie- en
-- trajecttype-koppeling en een reden. km_berekend bewaart de automatisch via
-- PDOK+OSRM berekende route, zodat de AI-engine route-afwijkingen kan zien
-- (handmatig opgehoogde km t.o.v. de berekende route).
alter table public.kilometer_records
  add column if not exists client_id        text references public.clienten(id) on delete set null,
  add column if not exists client_naam      text,
  add column if not exists locatie_id       uuid references public.locaties(id) on delete set null,
  add column if not exists traject_type     text,
  add column if not exists vertrekadres     text,
  add column if not exists bestemmingsadres text,
  add column if not exists reden            text,
  add column if not exists km_berekend      numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kilometer_records_traject_type_chk') then
    alter table public.kilometer_records
      add constraint kilometer_records_traject_type_chk
      check (traject_type is null or traject_type in ('ambulant','wlz','locatie','overig'));
  end if;
end $$;

create index if not exists idx_km_records_client  on public.kilometer_records (client_id);
create index if not exists idx_km_records_locatie on public.kilometer_records (locatie_id);
create index if not exists idx_km_records_datum   on public.kilometer_records (datum);

-- ----------------------------------------------------------------------------
-- 2) km_checkins — GPS web-check-in
-- ----------------------------------------------------------------------------
create table if not exists public.km_checkins (
  id                     uuid primary key default gen_random_uuid(),
  medewerker_id          uuid references public.medewerkers(id) on delete cascade,
  profiel_id             uuid references public.profiles(id) on delete set null,
  medewerker_naam        text,
  datum                  date not null,
  tijd                   timestamptz not null default now(),
  lat                    numeric,
  lng                    numeric,
  accuracy_m             numeric,
  locatie_id             uuid references public.locaties(id) on delete set null,
  locatie_naam           text,
  verwacht_lat           numeric,
  verwacht_lng           numeric,
  afstand_tot_locatie_m  numeric,
  status                 text not null default 'ok',     -- ok | afwijking | geen_locatie
  bron                   text not null default 'web',
  data                   jsonb not null default '{}'::jsonb,
  aanmaakdatum           timestamptz not null default now(),
  laatst_gewijzigd       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'km_checkins_status_chk') then
    alter table public.km_checkins
      add constraint km_checkins_status_chk
      check (status in ('ok','afwijking','geen_locatie'));
  end if;
end $$;

create index if not exists km_checkins_mw_idx    on public.km_checkins (medewerker_id);
create index if not exists km_checkins_datum_idx on public.km_checkins (datum);
create index if not exists km_checkins_status_idx on public.km_checkins (status);

drop trigger if exists trg_km_checkins_set_modified on public.km_checkins;
create trigger trg_km_checkins_set_modified
  before update on public.km_checkins
  for each row execute function public.set_laatst_gewijzigd();

alter table public.km_checkins enable row level security;
drop policy if exists "auth kan km_checkins lezen" on public.km_checkins;
create policy "auth kan km_checkins lezen" on public.km_checkins for select to authenticated using (true);
drop policy if exists "auth kan km_checkins toevoegen" on public.km_checkins;
create policy "auth kan km_checkins toevoegen" on public.km_checkins for insert to authenticated with check (true);
drop policy if exists "auth kan km_checkins bewerken" on public.km_checkins;
create policy "auth kan km_checkins bewerken" on public.km_checkins for update to authenticated using (true) with check (true);
drop policy if exists "auth kan km_checkins verwijderen" on public.km_checkins;
create policy "auth kan km_checkins verwijderen" on public.km_checkins for delete to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 3) km_signaal_config — drempelwaarden voor de AI-signaleringen
-- ----------------------------------------------------------------------------
create table if not exists public.km_signaal_config (
  sleutel          text primary key,
  waarde           numeric not null,
  omschrijving     text,
  laatst_gewijzigd timestamptz not null default now()
);

insert into public.km_signaal_config (sleutel, waarde, omschrijving) values
  ('hoge_rit_km',            75,   'Eén niet-automatische rit boven dit aantal km = signaal.'),
  ('hoge_maand_km',         1200,  'Maandtotaal per medewerker boven dit aantal km = signaal.'),
  ('route_afwijking_pct',    30,   'Handmatige km die >dit% boven de berekende route ligt = signaal.'),
  ('route_afwijking_min_km',  5,   'Route-afwijking alleen signaleren als de berekende route ≥ dit aantal km is.'),
  ('max_ritten_per_dag',      5,   'Meer dan dit aantal niet-automatische ritten op één dag = signaal.'),
  ('hoge_kosten_client_km', 400,   'Zakelijke km per cliënt (rollend) boven dit aantal = signaal.'),
  ('hoge_kosten_locatie_km',800,   'Woon-werk + zakelijke km per locatie (rollend) boven dit aantal = signaal.'),
  ('rollend_maanden',         3,   'Aantal maanden terug dat de engine analyseert.')
on conflict (sleutel) do nothing;

-- ----------------------------------------------------------------------------
-- 4) km_signaleringen — gedetecteerde anomalieën
-- ----------------------------------------------------------------------------
create table if not exists public.km_signaleringen (
  id               uuid primary key default gen_random_uuid(),
  signaal_type     text not null,   -- hoge_declaratie | afwijkende_route | dubbele_registratie | onlogische_reistijd | hoge_kosten_client | hoge_kosten_locatie
  ernst            text not null default 'midden',  -- laag | midden | hoog
  medewerker_id    uuid references public.medewerkers(id) on delete cascade,
  medewerker_naam  text,
  client_id        text references public.clienten(id) on delete set null,
  client_naam      text,
  locatie_id       uuid references public.locaties(id) on delete set null,
  locatie_naam     text,
  record_id        text,
  declaratie_id    text,
  jaar             integer,
  maand            integer,
  titel            text not null,
  omschrijving     text,
  waarde           numeric,
  drempel          numeric,
  status           text not null default 'open',  -- open | afgehandeld | genegeerd
  behandeld_door   uuid references public.profiles(id) on delete set null,
  behandeld_op     timestamptz,
  signaal_key      text unique,                   -- idempotency-sleutel
  aanmaakdatum     timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'km_signaleringen_status_chk') then
    alter table public.km_signaleringen
      add constraint km_signaleringen_status_chk
      check (status in ('open','afgehandeld','genegeerd'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'km_signaleringen_ernst_chk') then
    alter table public.km_signaleringen
      add constraint km_signaleringen_ernst_chk
      check (ernst in ('laag','midden','hoog'));
  end if;
end $$;

create index if not exists km_sig_status_idx on public.km_signaleringen (status);
create index if not exists km_sig_type_idx   on public.km_signaleringen (signaal_type);
create index if not exists km_sig_mw_idx     on public.km_signaleringen (medewerker_id);

drop trigger if exists trg_km_sig_set_modified on public.km_signaleringen;
create trigger trg_km_sig_set_modified
  before update on public.km_signaleringen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.km_signaleringen enable row level security;
drop policy if exists "auth kan km_signaleringen lezen" on public.km_signaleringen;
create policy "auth kan km_signaleringen lezen" on public.km_signaleringen for select to authenticated using (true);
drop policy if exists "auth kan km_signaleringen toevoegen" on public.km_signaleringen;
create policy "auth kan km_signaleringen toevoegen" on public.km_signaleringen for insert to authenticated with check (true);
drop policy if exists "auth kan km_signaleringen bewerken" on public.km_signaleringen;
create policy "auth kan km_signaleringen bewerken" on public.km_signaleringen for update to authenticated using (true) with check (true);
drop policy if exists "auth kan km_signaleringen verwijderen" on public.km_signaleringen;
create policy "auth kan km_signaleringen verwijderen" on public.km_signaleringen for delete to authenticated using (true);

alter table public.km_signaal_config enable row level security;
drop policy if exists "auth kan km_signaal_config lezen" on public.km_signaal_config;
create policy "auth kan km_signaal_config lezen" on public.km_signaal_config for select to authenticated using (true);
drop policy if exists "auth kan km_signaal_config bewerken" on public.km_signaal_config;
create policy "auth kan km_signaal_config bewerken" on public.km_signaal_config for update to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 5) km_genereer_signaleringen() — deterministische heuristiek-engine
-- ----------------------------------------------------------------------------
-- Idempotente upsert-helper (top-level; plpgsql staat geen geneste functies
-- toe). Schrijft één signaal als signaal_key nog niet bestaat. Geeft true terug
-- als er een NIEUW signaal is (of zou worden bij dry-run).
create or replace function public.km_sig_upsert(
  p_dry_run boolean, p_key text, p_type text, p_ernst text,
  p_mw uuid, p_mw_naam text, p_client_id text, p_client_naam text,
  p_loc_id uuid, p_loc_naam text, p_record_id text, p_decl_id text,
  p_jaar int, p_maand int, p_titel text, p_oms text,
  p_waarde numeric, p_drempel numeric
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.km_signaleringen where signaal_key = p_key) then
    return false;
  end if;
  if p_dry_run then
    return true;
  end if;
  insert into public.km_signaleringen
    (signaal_type, ernst, medewerker_id, medewerker_naam, client_id, client_naam,
     locatie_id, locatie_naam, record_id, declaratie_id, jaar, maand, titel,
     omschrijving, waarde, drempel, signaal_key)
  values
    (p_type, p_ernst, p_mw, p_mw_naam, p_client_id, p_client_naam,
     p_loc_id, p_loc_naam, p_record_id, p_decl_id, p_jaar, p_maand, p_titel,
     p_oms, p_waarde, p_drempel, p_key)
  on conflict (signaal_key) do nothing;
  return true;
end;
$$;
revoke all on function public.km_sig_upsert(boolean,text,text,text,uuid,text,text,text,uuid,text,text,text,int,int,text,text,numeric,numeric) from public, anon;
grant execute on function public.km_sig_upsert(boolean,text,text,text,uuid,text,text,text,uuid,text,text,text,int,int,text,text,numeric,numeric) to service_role;

-- Scant de records van de laatste `rollend_maanden` maanden en schrijft nieuwe
-- signaleringen. Idempotent via signaal_key: een al bestaand signaal wordt niet
-- gedupliceerd; een al AFGEHANDELD/GENEGEERD signaal wordt met rust gelaten.
-- p_dry_run=true telt alleen (schrijft niets).
create or replace function public.km_genereer_signaleringen(p_dry_run boolean default false)
returns table (
  hoge_declaratie      integer,
  afwijkende_route     integer,
  dubbele_registratie  integer,
  onlogische_reistijd  integer,
  hoge_kosten_client   integer,
  hoge_kosten_locatie  integer,
  totaal_nieuw         integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg                 jsonb;
  v_hoge_rit          numeric;
  v_hoge_maand        numeric;
  v_route_pct         numeric;
  v_route_min         numeric;
  v_max_dag           numeric;
  v_client_km         numeric;
  v_locatie_km        numeric;
  v_maanden           integer;
  v_van               date;
  r                   record;
  v_key               text;
  c_hd integer := 0; c_ar integer := 0; c_dr integer := 0;
  c_or integer := 0; c_hc integer := 0; c_hl integer := 0;
begin
  select coalesce(jsonb_object_agg(sleutel, waarde), '{}'::jsonb) into cfg
  from public.km_signaal_config;
  v_hoge_rit   := coalesce((cfg->>'hoge_rit_km')::numeric, 75);
  v_hoge_maand := coalesce((cfg->>'hoge_maand_km')::numeric, 1200);
  v_route_pct  := coalesce((cfg->>'route_afwijking_pct')::numeric, 30);
  v_route_min  := coalesce((cfg->>'route_afwijking_min_km')::numeric, 5);
  v_max_dag    := coalesce((cfg->>'max_ritten_per_dag')::numeric, 5);
  v_client_km  := coalesce((cfg->>'hoge_kosten_client_km')::numeric, 400);
  v_locatie_km := coalesce((cfg->>'hoge_kosten_locatie_km')::numeric, 800);
  v_maanden    := coalesce((cfg->>'rollend_maanden')::numeric, 3)::integer;
  v_van := (date_trunc('month', (now() at time zone 'Europe/Amsterdam')::date) - (v_maanden || ' months')::interval)::date;

  -- (a) Opvallend hoge enkele rit (niet automatisch)
  for r in
    select rec.id, rec.datum, rec.kilometers, rec.beschrijving, rec.declaratie_id,
           d.medewerker_id, d.jaar, d.maand,
           (mw.voornaam || ' ' || mw.achternaam) as mw_naam
    from public.kilometer_records rec
    join public.kilometer_declaraties d on d.id = rec.declaratie_id
    left join public.medewerkers mw on mw.id = d.medewerker_id
    where coalesce(rec.is_automatic, false) = false
      and rec.datum >= v_van
      and coalesce(rec.kilometers,0) > v_hoge_rit
  loop
    v_key := 'hoge_rit:' || r.id;
    if km_sig_upsert(p_dry_run, v_key,'hoge_declaratie',
           case when r.kilometers > v_hoge_rit*1.5 then 'hoog' else 'midden' end,
           r.medewerker_id, r.mw_naam, null, null, null, null, r.id, r.declaratie_id,
           r.jaar, r.maand, 'Hoge kilometerdeclaratie',
           'Eén rit van ' || round(r.kilometers,1) || ' km op ' || to_char(r.datum,'DD-MM-YYYY')
             || coalesce(' — ' || nullif(r.beschrijving,''), '') || ' (drempel ' || round(v_hoge_rit) || ' km).',
           r.kilometers, v_hoge_rit) then c_hd := c_hd + 1; end if;
  end loop;

  -- (b) Hoog maandtotaal per medewerker
  for r in
    select d.medewerker_id, d.jaar, d.maand, d.id as decl_id,
           (mw.voornaam || ' ' || mw.achternaam) as mw_naam,
           sum(coalesce(rec.kilometers,0)) as totaal_km
    from public.kilometer_declaraties d
    join public.kilometer_records rec on rec.declaratie_id = d.id
       and (rec.approval_status is null or rec.approval_status = 'approved')
    left join public.medewerkers mw on mw.id = d.medewerker_id
    where make_date(d.jaar, d.maand, 1) >= date_trunc('month', v_van)::date
    group by d.medewerker_id, d.jaar, d.maand, d.id, mw.voornaam, mw.achternaam
    having sum(coalesce(rec.kilometers,0)) > v_hoge_maand
  loop
    v_key := 'hoge_maand:' || coalesce(r.medewerker_id::text,'?') || ':' || r.jaar || '-' || r.maand;
    if km_sig_upsert(p_dry_run, v_key,'hoge_declaratie',
           case when r.totaal_km > v_hoge_maand*1.5 then 'hoog' else 'midden' end,
           r.medewerker_id, r.mw_naam, null, null, null, null, null, r.decl_id,
           r.jaar, r.maand, 'Hoog maandtotaal kilometers',
           'Maandtotaal ' || round(r.totaal_km) || ' km (' || r.maand || '-' || r.jaar
             || ', drempel ' || round(v_hoge_maand) || ' km).',
           r.totaal_km, v_hoge_maand) then c_hd := c_hd + 1; end if;
  end loop;

  -- (c) Afwijkende route: handmatige km >x% boven berekende route
  for r in
    select rec.id, rec.datum, rec.kilometers, rec.km_berekend, rec.beschrijving, rec.declaratie_id,
           d.medewerker_id, d.jaar, d.maand,
           (mw.voornaam || ' ' || mw.achternaam) as mw_naam
    from public.kilometer_records rec
    join public.kilometer_declaraties d on d.id = rec.declaratie_id
    left join public.medewerkers mw on mw.id = d.medewerker_id
    where rec.km_berekend is not null
      and rec.km_berekend >= v_route_min
      and rec.datum >= v_van
      and coalesce(rec.kilometers,0) > rec.km_berekend * (1 + v_route_pct/100.0)
  loop
    v_key := 'route:' || r.id;
    if km_sig_upsert(p_dry_run, v_key,'afwijkende_route', 'midden',
           r.medewerker_id, r.mw_naam, null, null, null, null, r.id, r.declaratie_id,
           r.jaar, r.maand, 'Afwijkende route',
           'Ingevoerd ' || round(r.kilometers,1) || ' km, berekende route ' || round(r.km_berekend,1)
             || ' km op ' || to_char(r.datum,'DD-MM-YYYY') || ' (>' || round(v_route_pct) || '% afwijking).',
           r.kilometers, r.km_berekend) then c_ar := c_ar + 1; end if;
  end loop;

  -- (d) Dubbele registratie: zelfde medewerker + dag + ~km + bestemming, >1×
  for r in
    select d.medewerker_id, rec.datum,
           round(coalesce(rec.kilometers,0)) as km_round,
           lower(btrim(coalesce(nullif(rec.bestemmingsadres,''), rec.locatie_naam, rec.beschrijving, ''))) as bestemming,
           count(*) as n, min(rec.id) as eerste_id, max(rec.declaratie_id) as decl_id, d.jaar, d.maand,
           (mw.voornaam || ' ' || mw.achternaam) as mw_naam
    from public.kilometer_records rec
    join public.kilometer_declaraties d on d.id = rec.declaratie_id
    left join public.medewerkers mw on mw.id = d.medewerker_id
    where coalesce(rec.is_automatic, false) = false
      and rec.datum >= v_van
      and btrim(coalesce(nullif(rec.bestemmingsadres,''), rec.locatie_naam, rec.beschrijving, '')) <> ''
    group by d.medewerker_id, rec.datum, round(coalesce(rec.kilometers,0)),
             lower(btrim(coalesce(nullif(rec.bestemmingsadres,''), rec.locatie_naam, rec.beschrijving, ''))),
             d.jaar, d.maand, mw.voornaam, mw.achternaam
    having count(*) > 1
  loop
    v_key := 'dubbel:' || coalesce(r.medewerker_id::text,'?') || ':' || r.datum || ':' || r.km_round || ':' || md5(r.bestemming);
    if km_sig_upsert(p_dry_run, v_key,'dubbele_registratie', 'midden',
           r.medewerker_id, r.mw_naam, null, null, null, null, r.eerste_id, r.decl_id,
           r.jaar, r.maand, 'Mogelijke dubbele registratie',
           r.n || ' ritten van ~' || r.km_round || ' km naar dezelfde bestemming op ' || to_char(r.datum,'DD-MM-YYYY') || '.',
           r.n, 1) then c_dr := c_dr + 1; end if;
  end loop;

  -- (e) Onlogische reistijd-indicatie: veel niet-automatische ritten op één dag
  for r in
    select d.medewerker_id, rec.datum, count(*) as n, max(rec.declaratie_id) as decl_id,
           d.jaar, d.maand, (mw.voornaam || ' ' || mw.achternaam) as mw_naam
    from public.kilometer_records rec
    join public.kilometer_declaraties d on d.id = rec.declaratie_id
    left join public.medewerkers mw on mw.id = d.medewerker_id
    where coalesce(rec.is_automatic, false) = false
      and rec.datum >= v_van
    group by d.medewerker_id, rec.datum, d.jaar, d.maand, mw.voornaam, mw.achternaam
    having count(*) > v_max_dag
  loop
    v_key := 'veel_ritten:' || coalesce(r.medewerker_id::text,'?') || ':' || r.datum;
    if km_sig_upsert(p_dry_run, v_key,'onlogische_reistijd', 'midden',
           r.medewerker_id, r.mw_naam, null, null, null, null, null, r.decl_id,
           r.jaar, r.maand, 'Veel ritten op één dag',
           r.n || ' losse ritten op ' || to_char(r.datum,'DD-MM-YYYY') || ' (drempel ' || round(v_max_dag) || ') — controleer reistijden.',
           r.n, v_max_dag) then c_or := c_or + 1; end if;
  end loop;

  -- (f) Hoge kosten per cliënt (rollend)
  for r in
    select rec.client_id, max(rec.client_naam) as client_naam,
           sum(coalesce(rec.kilometers,0)) as totaal_km
    from public.kilometer_records rec
    where rec.client_id is not null
      and rec.datum >= v_van
    group by rec.client_id
    having sum(coalesce(rec.kilometers,0)) > v_client_km
  loop
    v_key := 'client_kosten:' || r.client_id || ':' || to_char(v_van,'YYYY-MM');
    if km_sig_upsert(p_dry_run, v_key,'hoge_kosten_client',
           case when r.totaal_km > v_client_km*1.5 then 'hoog' else 'midden' end,
           null, null, r.client_id, r.client_naam, null, null, null, null,
           null, null, 'Hoge kilometerkosten per cliënt',
           coalesce(r.client_naam,'Cliënt') || ': ' || round(r.totaal_km) || ' zakelijke km in '
             || v_maanden || ' mnd (drempel ' || round(v_client_km) || ' km).',
           r.totaal_km, v_client_km) then c_hc := c_hc + 1; end if;
  end loop;

  -- (g) Hoge kosten per locatie (rollend)
  for r in
    select coalesce(rec.locatie_naam, '—') as locatie_naam, rec.locatie_id,
           sum(coalesce(rec.kilometers,0)) as totaal_km
    from public.kilometer_records rec
    where rec.datum >= v_van
      and coalesce(nullif(rec.locatie_naam,''), '') <> ''
    group by rec.locatie_naam, rec.locatie_id
    having sum(coalesce(rec.kilometers,0)) > v_locatie_km
  loop
    v_key := 'locatie_kosten:' || lower(r.locatie_naam) || ':' || to_char(v_van,'YYYY-MM');
    if km_sig_upsert(p_dry_run, v_key,'hoge_kosten_locatie',
           case when r.totaal_km > v_locatie_km*1.5 then 'hoog' else 'midden' end,
           null, null, null, null, r.locatie_id, r.locatie_naam, null, null,
           null, null, 'Hoge kilometerkosten per locatie',
           r.locatie_naam || ': ' || round(r.totaal_km) || ' km in ' || v_maanden
             || ' mnd (drempel ' || round(v_locatie_km) || ' km).',
           r.totaal_km, v_locatie_km) then c_hl := c_hl + 1; end if;
  end loop;

  return query select c_hd, c_ar, c_dr, c_or, c_hc, c_hl,
                      (c_hd + c_ar + c_dr + c_or + c_hc + c_hl);
end;
$$;
revoke all on function public.km_genereer_signaleringen(boolean) from public, anon;
grant execute on function public.km_genereer_signaleringen(boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6) Dashboard-RPC's (SECURITY DEFINER, read-only aggregaties)
-- ----------------------------------------------------------------------------
-- Vergoeding per rit = least(km,100) × €0,39. Werk-werk dat nog op goedkeuring
-- wacht (pending) of is afgewezen (rejected) telt NIET mee — 1-op-1 met de JS-
-- rekenmotor (computeTotals in kilometer-declaraties-data.js).
-- Woon-werk = type 'office' of is_automatic; zakelijk = de rest.

create or replace function public.km_dash_totalen(p_van date, p_tot date)
returns table (
  total_km numeric, total_eur numeric,
  woonwerk_km numeric, woonwerk_eur numeric,
  zakelijk_km numeric, zakelijk_eur numeric,
  aantal_ritten integer, aantal_medewerkers integer,
  aantal_clienten integer, gem_km_per_rit numeric
)
language sql stable security definer set search_path = public as $$
  with r as (
    select rec.*, d.medewerker_id
    from public.kilometer_records rec
    join public.kilometer_declaraties d on d.id = rec.declaratie_id
    where rec.datum between p_van and p_tot
      and (rec.approval_status is null or rec.approval_status = 'approved')
  )
  select
    coalesce(round(sum(kilometers),1),0),
    coalesce(round(sum(least(coalesce(kilometers,0),100)*0.39),2),0),
    coalesce(round(sum(kilometers) filter (where type='office' or is_automatic),1),0),
    coalesce(round(sum(least(coalesce(kilometers,0),100)*0.39) filter (where type='office' or is_automatic),2),0),
    coalesce(round(sum(kilometers) filter (where not (type='office' or is_automatic)),1),0),
    coalesce(round(sum(least(coalesce(kilometers,0),100)*0.39) filter (where not (type='office' or is_automatic)),2),0),
    coalesce(count(*),0)::integer,
    coalesce(count(distinct medewerker_id),0)::integer,
    coalesce(count(distinct client_id),0)::integer,
    coalesce(round(avg(kilometers),1),0)
  from r;
$$;
revoke all on function public.km_dash_totalen(date,date) from public, anon;
grant execute on function public.km_dash_totalen(date,date) to authenticated, service_role;

create or replace function public.km_dash_per_locatie(p_van date, p_tot date)
returns table (locatie_naam text, locatie_id uuid, km numeric, eur numeric, ritten integer)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(rec.locatie_naam,''),'— onbekend') as locatie_naam,
         (min(rec.locatie_id::text))::uuid as locatie_id,
         round(sum(coalesce(rec.kilometers,0)),1) as km,
         round(sum(least(coalesce(rec.kilometers,0),100)*0.39),2) as eur,
         count(*)::integer as ritten
  from public.kilometer_records rec
  where rec.datum between p_van and p_tot
    and (rec.approval_status is null or rec.approval_status = 'approved')
  group by coalesce(nullif(rec.locatie_naam,''),'— onbekend')
  order by km desc;
$$;
revoke all on function public.km_dash_per_locatie(date,date) from public, anon;
grant execute on function public.km_dash_per_locatie(date,date) to authenticated, service_role;

create or replace function public.km_dash_per_client(p_van date, p_tot date)
returns table (client_naam text, client_id text, km numeric, eur numeric, ritten integer)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(rec.client_naam,''),'— onbekend') as client_naam,
         max(rec.client_id) as client_id,
         round(sum(coalesce(rec.kilometers,0)),1) as km,
         round(sum(least(coalesce(rec.kilometers,0),100)*0.39),2) as eur,
         count(*)::integer as ritten
  from public.kilometer_records rec
  where rec.datum between p_van and p_tot
    and rec.client_id is not null
    and (rec.approval_status is null or rec.approval_status = 'approved')
  group by coalesce(nullif(rec.client_naam,''),'— onbekend')
  order by km desc;
$$;
revoke all on function public.km_dash_per_client(date,date) from public, anon;
grant execute on function public.km_dash_per_client(date,date) to authenticated, service_role;

create or replace function public.km_dash_per_medewerker(p_van date, p_tot date)
returns table (medewerker_naam text, medewerker_id uuid, km numeric, eur numeric, ritten integer)
language sql stable security definer set search_path = public as $$
  select coalesce(mw.voornaam || ' ' || mw.achternaam, '— onbekend') as medewerker_naam,
         d.medewerker_id,
         round(sum(coalesce(rec.kilometers,0)),1) as km,
         round(sum(least(coalesce(rec.kilometers,0),100)*0.39),2) as eur,
         count(*)::integer as ritten
  from public.kilometer_records rec
  join public.kilometer_declaraties d on d.id = rec.declaratie_id
  left join public.medewerkers mw on mw.id = d.medewerker_id
  where rec.datum between p_van and p_tot
    and (rec.approval_status is null or rec.approval_status = 'approved')
  group by d.medewerker_id, mw.voornaam, mw.achternaam
  order by km desc;
$$;
revoke all on function public.km_dash_per_medewerker(date,date) from public, anon;
grant execute on function public.km_dash_per_medewerker(date,date) to authenticated, service_role;

create or replace function public.km_dash_tijdreeks(p_van date, p_tot date)
returns table (dag date, km numeric, eur numeric)
language sql stable security definer set search_path = public as $$
  select rec.datum as dag,
         round(sum(coalesce(rec.kilometers,0)),1) as km,
         round(sum(least(coalesce(rec.kilometers,0),100)*0.39),2) as eur
  from public.kilometer_records rec
  where rec.datum between p_van and p_tot
    and (rec.approval_status is null or rec.approval_status = 'approved')
  group by rec.datum
  order by rec.datum;
$$;
revoke all on function public.km_dash_tijdreeks(date,date) from public, anon;
grant execute on function public.km_dash_tijdreeks(date,date) to authenticated, service_role;

-- Planning: verwachte woon-werk reiskosten per locatie op basis van geplande
-- diensten × afstandsmatrix (zelfde naam-match als km_genereer_vorige_maand).
create or replace function public.km_planning_reiskosten(p_van date, p_tot date)
returns table (locatie_naam text, dienstdagen integer, medewerkers integer, verwachte_km numeric, verwachte_eur numeric)
language sql stable security definer set search_path = public as $$
  with dagen as (
    select distinct mw.id as mw_id, loc.naam as locatie_naam, mla.km_enkel,
           (p.start_iso at time zone 'Europe/Amsterdam')::date as dag
    from public.planning p
    join public.medewerkers mw
      on mw.archived = false
     and lower(btrim(coalesce(mw.dienstverband,''))) in ('loondienst','permanent','vast')
     and lower(btrim(coalesce(p.teamlid,''))) = lower(btrim(mw.voornaam || ' ' || mw.achternaam))
    join public.locaties loc
      on loc.archived = false
     and lower(btrim(loc.naam)) = lower(btrim(coalesce(nullif(btrim(p.locatie),''), nullif(btrim(p.vestiging),''))))
    left join public.medewerker_locatie_afstanden mla
      on mla.locatie_id = loc.id and mla.medewerker_id = mw.id
    where p.archived = false
      and (p.start_iso at time zone 'Europe/Amsterdam')::date between p_van and p_tot
  )
  select locatie_naam,
         count(*)::integer as dienstdagen,
         count(distinct mw_id)::integer as medewerkers,
         round(sum(coalesce(km_enkel,0) * 2),1) as verwachte_km,
         round(sum(least(coalesce(km_enkel,0),100)*0.39*2),2) as verwachte_eur
  from dagen
  group by locatie_naam
  order by verwachte_km desc;
$$;
revoke all on function public.km_planning_reiskosten(date,date) from public, anon;
grant execute on function public.km_planning_reiskosten(date,date) to authenticated, service_role;

-- HR-controle-tellers: open werk-werk-goedkeuringen, afgewezen ritten,
-- openstaande afwijkingen, open signaleringen, ontbrekende woon-werk-afstanden.
create or replace function public.km_hr_controle()
returns table (
  open_goedkeuringen     integer,
  afgewezen_ritten       integer,
  open_afwijkingen       integer,
  open_signaleringen     integer,
  hoge_signaleringen     integer,
  ontbrekende_afstanden  integer,
  open_check_afwijkingen integer
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.kilometer_records where approval_status = 'pending')::integer,
    (select count(*) from public.kilometer_records where approval_status = 'rejected')::integer,
    (select count(*) from public.kilometer_afwijkingen where status = 'open')::integer,
    (select count(*) from public.km_signaleringen where status = 'open')::integer,
    (select count(*) from public.km_signaleringen where status = 'open' and ernst = 'hoog')::integer,
    (select count(*) from public.medewerker_locatie_afstanden where km_enkel is null)::integer,
    (select count(*) from public.km_checkins where status = 'afwijking')::integer;
$$;
revoke all on function public.km_hr_controle() from public, anon;
grant execute on function public.km_hr_controle() to authenticated, service_role;
