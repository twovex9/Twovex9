-- ============================================================================
-- Besa Suite - Supabase schema
-- ============================================================================
--
-- Hoe te draaien: open in Supabase Dashboard -> SQL Editor -> New query,
-- plak de inhoud van dit bestand, klik Run. Idempotent: meermaals draaien
-- mag, geeft geen fouten.
--
-- Pilot-fase: alleen tabel `competenties`. Andere tabellen volgen in
-- volgende migraties (medewerkers, clienten, beschikkingen, ...).
--
-- ============================================================================
-- competenties (HR module)
-- ============================================================================

create table if not exists public.competenties (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

-- Naam mag maar 1 keer voorkomen onder de actieve (niet-gearchiveerde) rijen.
-- Hoofdletters maken niet uit ('stressbestendig' == 'Stressbestendig').
create unique index if not exists competenties_naam_unique_active
  on public.competenties (lower(naam))
  where archived = false;

-- Index voor snelle filtering op archief-status.
create index if not exists competenties_archived_idx
  on public.competenties (archived);

-- Trigger: zet laatst_gewijzigd automatisch bij elke UPDATE.
--
-- search_path is expliciet vastgezet om Supabase Security Advisor warning
-- "function_search_path_mutable" te voldoen. Zonder dit kan een rol met
-- CREATE-rechten op een gedeeld schema theoretisch een eigen `now()` of
-- ander symbool injecteren dat door deze functie wordt gebruikt.
create or replace function public.set_laatst_gewijzigd()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.laatst_gewijzigd := now();
  return new;
end;
$$;

drop trigger if exists trg_competenties_set_modified on public.competenties;
create trigger trg_competenties_set_modified
  before update on public.competenties
  for each row execute function public.set_laatst_gewijzigd();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
--
-- HUIDIGE FASE: GEEN LOGIN.
-- Alle gebruikers (anon-rol) mogen lezen/schrijven. Beveiliging gebeurt op
-- applicatieniveau (Vercel-deployment is niet publiek bekend).
--
-- TOEKOMSTIGE FASE: NA ACTIVATIE LOGIN.
-- Vervang de "anon"-policies hieronder door de "authenticated"-policies
-- die staan uitgecommentarieerd in het onderste blok.
--
-- ============================================================================

alter table public.competenties enable row level security;

-- HUIDIGE policies (anon mag alles)
drop policy if exists "anon kan competenties lezen" on public.competenties;
create policy "anon kan competenties lezen"
  on public.competenties
  for select
  to anon
  using (true);

drop policy if exists "anon kan competenties toevoegen" on public.competenties;
create policy "anon kan competenties toevoegen"
  on public.competenties
  for insert
  to anon
  with check (true);

drop policy if exists "anon kan competenties bewerken" on public.competenties;
create policy "anon kan competenties bewerken"
  on public.competenties
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "anon kan competenties verwijderen" on public.competenties;
create policy "anon kan competenties verwijderen"
  on public.competenties
  for delete
  to anon
  using (true);

-- ============================================================================
-- TOEKOMSTIGE policies (uit-commentarieren wanneer login actief wordt)
-- ============================================================================
--
-- Stappen om login te activeren:
--   1. In supabase-client.js: zet AUTH_ENABLED = true.
--   2. Draai onderstaand SQL-blok in de SQL Editor.
--   3. (Optioneel) Voeg auth UI toe aan de app.
--
-- drop policy if exists "anon kan competenties lezen" on public.competenties;
-- drop policy if exists "anon kan competenties toevoegen" on public.competenties;
-- drop policy if exists "anon kan competenties bewerken" on public.competenties;
-- drop policy if exists "anon kan competenties verwijderen" on public.competenties;
--
-- create policy "ingelogd kan competenties lezen"
--   on public.competenties for select to authenticated using (true);
-- create policy "ingelogd kan competenties toevoegen"
--   on public.competenties for insert to authenticated with check (true);
-- create policy "ingelogd kan competenties bewerken"
--   on public.competenties for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan competenties verwijderen"
--   on public.competenties for delete to authenticated using (true);

-- ============================================================================
-- Seed-data (idempotent: alleen invoegen als niet aanwezig)
-- ============================================================================

insert into public.competenties (naam)
select 'Stressbestendig'
where not exists (
  select 1 from public.competenties where lower(naam) = lower('Stressbestendig')
);

-- ============================================================================
-- opleidingen (HR module)
-- ============================================================================

create table if not exists public.opleidingen (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  skj boolean not null default false,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create unique index if not exists opleidingen_naam_unique_active
  on public.opleidingen (lower(naam))
  where archived = false;

create index if not exists opleidingen_archived_idx
  on public.opleidingen (archived);

drop trigger if exists trg_opleidingen_set_modified on public.opleidingen;
create trigger trg_opleidingen_set_modified
  before update on public.opleidingen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.opleidingen enable row level security;

drop policy if exists "anon kan opleidingen lezen" on public.opleidingen;
create policy "anon kan opleidingen lezen"
  on public.opleidingen for select to anon using (true);

drop policy if exists "anon kan opleidingen toevoegen" on public.opleidingen;
create policy "anon kan opleidingen toevoegen"
  on public.opleidingen for insert to anon with check (true);

drop policy if exists "anon kan opleidingen bewerken" on public.opleidingen;
create policy "anon kan opleidingen bewerken"
  on public.opleidingen for update to anon using (true) with check (true);

drop policy if exists "anon kan opleidingen verwijderen" on public.opleidingen;
create policy "anon kan opleidingen verwijderen"
  on public.opleidingen for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan opleidingen lezen" on public.opleidingen;
-- drop policy if exists "anon kan opleidingen toevoegen" on public.opleidingen;
-- drop policy if exists "anon kan opleidingen bewerken" on public.opleidingen;
-- drop policy if exists "anon kan opleidingen verwijderen" on public.opleidingen;
-- create policy "ingelogd kan opleidingen lezen"
--   on public.opleidingen for select to authenticated using (true);
-- create policy "ingelogd kan opleidingen toevoegen"
--   on public.opleidingen for insert to authenticated with check (true);
-- create policy "ingelogd kan opleidingen bewerken"
--   on public.opleidingen for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan opleidingen verwijderen"
--   on public.opleidingen for delete to authenticated using (true);

-- ============================================================================
-- zorgsoorten (Cli?nten module ? referentiedata)
-- ============================================================================

create table if not exists public.zorgsoorten (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  tarieftype text not null check (tarieftype in ('dag', 'uur', 'week')),
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create unique index if not exists zorgsoorten_naam_unique_active
  on public.zorgsoorten (lower(naam))
  where archived = false;

create index if not exists zorgsoorten_archived_idx on public.zorgsoorten (archived);

drop trigger if exists trg_zorgsoorten_set_modified on public.zorgsoorten;
create trigger trg_zorgsoorten_set_modified
  before update on public.zorgsoorten
  for each row execute function public.set_laatst_gewijzigd();

alter table public.zorgsoorten enable row level security;

drop policy if exists "anon kan zorgsoorten lezen" on public.zorgsoorten;
create policy "anon kan zorgsoorten lezen"
  on public.zorgsoorten for select to anon using (true);

drop policy if exists "anon kan zorgsoorten toevoegen" on public.zorgsoorten;
create policy "anon kan zorgsoorten toevoegen"
  on public.zorgsoorten for insert to anon with check (true);

drop policy if exists "anon kan zorgsoorten bewerken" on public.zorgsoorten;
create policy "anon kan zorgsoorten bewerken"
  on public.zorgsoorten for update to anon using (true) with check (true);

drop policy if exists "anon kan zorgsoorten verwijderen" on public.zorgsoorten;
create policy "anon kan zorgsoorten verwijderen"
  on public.zorgsoorten for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan zorgsoorten lezen" on public.zorgsoorten;
-- drop policy if exists "anon kan zorgsoorten toevoegen" on public.zorgsoorten;
-- drop policy if exists "anon kan zorgsoorten bewerken" on public.zorgsoorten;
-- drop policy if exists "anon kan zorgsoorten verwijderen" on public.zorgsoorten;
-- create policy "ingelogd kan zorgsoorten lezen"
--   on public.zorgsoorten for select to authenticated using (true);
-- create policy "ingelogd kan zorgsoorten toevoegen"
--   on public.zorgsoorten for insert to authenticated with check (true);
-- create policy "ingelogd kan zorgsoorten bewerken"
--   on public.zorgsoorten for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan zorgsoorten verwijderen"
--   on public.zorgsoorten for delete to authenticated using (true);

insert into public.zorgsoorten (naam, tarieftype)
select v.naam, v.tarieftype
from (values
  ('Gecombineerd', 'week'),
  ('Wlz', 'uur'),
  ('Ambulant extern', 'uur'),
  ('Fasewonen', 'dag'),
  ('Ambulant intern', 'uur'),
  ('Verblijf en behandeling', 'dag')
) as v(naam, tarieftype)
where not exists (
  select 1 from public.zorgsoorten z where lower(z.naam) = lower(v.naam)
);

-- ============================================================================
-- bureaus (HR module ? referentiedata)
-- ============================================================================

create table if not exists public.bureaus (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  standaard_uurtarief numeric(10, 2),
  fee_per_uur numeric(10, 2),
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create unique index if not exists bureaus_naam_unique_active
  on public.bureaus (lower(naam))
  where archived = false;

create index if not exists bureaus_archived_idx on public.bureaus (archived);

drop trigger if exists trg_bureaus_set_modified on public.bureaus;
create trigger trg_bureaus_set_modified
  before update on public.bureaus
  for each row execute function public.set_laatst_gewijzigd();

alter table public.bureaus enable row level security;

drop policy if exists "anon kan bureaus lezen" on public.bureaus;
create policy "anon kan bureaus lezen"
  on public.bureaus for select to anon using (true);

drop policy if exists "anon kan bureaus toevoegen" on public.bureaus;
create policy "anon kan bureaus toevoegen"
  on public.bureaus for insert to anon with check (true);

drop policy if exists "anon kan bureaus bewerken" on public.bureaus;
create policy "anon kan bureaus bewerken"
  on public.bureaus for update to anon using (true) with check (true);

drop policy if exists "anon kan bureaus verwijderen" on public.bureaus;
create policy "anon kan bureaus verwijderen"
  on public.bureaus for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan bureaus lezen" on public.bureaus;
-- drop policy if exists "anon kan bureaus toevoegen" on public.bureaus;
-- drop policy if exists "anon kan bureaus bewerken" on public.bureaus;
-- drop policy if exists "anon kan bureaus verwijderen" on public.bureaus;
-- create policy "ingelogd kan bureaus lezen"
--   on public.bureaus for select to authenticated using (true);
-- create policy "ingelogd kan bureaus toevoegen"
--   on public.bureaus for insert to authenticated with check (true);
-- create policy "ingelogd kan bureaus bewerken"
--   on public.bureaus for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan bureaus verwijderen"
--   on public.bureaus for delete to authenticated using (true);

insert into public.bureaus (naam, standaard_uurtarief, fee_per_uur)
select v.naam, v.tarief, v.fee
from (values
  ('Zorgkracht Direct', 47::numeric, null::numeric),
  ('BLND', null::numeric, null::numeric),
  ('Optimum Flex', null::numeric, null::numeric),
  ('Level Up', null::numeric, null::numeric)
) as v(naam, tarief, fee)
where not exists (
  select 1 from public.bureaus b where lower(b.naam) = lower(v.naam)
);

-- ============================================================================
-- locaties (HR module ? referentiedata met adres + kleur)
-- ============================================================================

create table if not exists public.locaties (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  adres text,
  kleur text not null default '#64748b',
  postcode text,
  huisnummer text,
  toevoeging text,
  straat text,
  plaats text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

-- Geen unique-naam-index: locaties kunnen rechtmatig dezelfde naam dragen
-- (bijv. drie satellietwoningen).
create index if not exists locaties_naam_idx on public.locaties (lower(naam));
create index if not exists locaties_archived_idx on public.locaties (archived);

drop trigger if exists trg_locaties_set_modified on public.locaties;
create trigger trg_locaties_set_modified
  before update on public.locaties
  for each row execute function public.set_laatst_gewijzigd();

alter table public.locaties enable row level security;

drop policy if exists "anon kan locaties lezen" on public.locaties;
create policy "anon kan locaties lezen"
  on public.locaties for select to anon using (true);

drop policy if exists "anon kan locaties toevoegen" on public.locaties;
create policy "anon kan locaties toevoegen"
  on public.locaties for insert to anon with check (true);

drop policy if exists "anon kan locaties bewerken" on public.locaties;
create policy "anon kan locaties bewerken"
  on public.locaties for update to anon using (true) with check (true);

drop policy if exists "anon kan locaties verwijderen" on public.locaties;
create policy "anon kan locaties verwijderen"
  on public.locaties for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan locaties lezen" on public.locaties;
-- drop policy if exists "anon kan locaties toevoegen" on public.locaties;
-- drop policy if exists "anon kan locaties bewerken" on public.locaties;
-- drop policy if exists "anon kan locaties verwijderen" on public.locaties;
-- create policy "ingelogd kan locaties lezen"
--   on public.locaties for select to authenticated using (true);
-- create policy "ingelogd kan locaties toevoegen"
--   on public.locaties for insert to authenticated with check (true);
-- create policy "ingelogd kan locaties bewerken"
--   on public.locaties for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan locaties verwijderen"
--   on public.locaties for delete to authenticated using (true);

-- Seed alleen als de tabel volledig leeg is (vermijdt dubbele satellieten).
insert into public.locaties (naam, adres, kleur, postcode, huisnummer, toevoeging, straat, plaats, aanmaakdatum, laatst_gewijzigd)
select * from (values
  ('Kantoor Magdalenenstraat', 'Magdalenenstraat 17, Alkmaar', '#ab94ff', '', '17', '', 'Magdalenenstraat', 'Alkmaar', '2026-04-09T12:32:00+00'::timestamptz, '2026-04-09T12:32:00+00'::timestamptz),
  ('Zijperstraat', 'Zijperstraat 35, 1823CX Alkmaar', '#60a5fa', '1823CX', '35', '', 'Zijperstraat', 'Alkmaar', '2026-03-16T20:37:00+00'::timestamptz, '2026-03-16T20:37:00+00'::timestamptz),
  ('Leonard Bramerstraat', 'Leonard Bramerstraat 7, 1816TR Alkmaar', '#34d399', '1816TR', '7', '', 'Leonard Bramerstraat', 'Alkmaar', '2026-03-10T14:15:00+00'::timestamptz, '2026-03-10T14:15:00+00'::timestamptz),
  ('Breedstraat', 'Breedstraat 38, 1811DE Alkmaar', '#fbbf24', '1811DE', '38', '', 'Breedstraat', 'Alkmaar', '2026-02-01T09:00:00+00'::timestamptz, '2026-03-28T11:22:00+00'::timestamptz),
  ('Magdalenenstraat', 'Magdalenenstraat 22, 1811EG Alkmaar', '#f472b6', '1811EG', '22', '', 'Magdalenenstraat', 'Alkmaar', '2025-11-05T10:30:00+00'::timestamptz, '2026-03-03T16:40:00+00'::timestamptz),
  ('Varnebroek', 'Varnebroekerweg 10, 1724MP Heerhugowaard', '#a78bfa', '1724MP', '10', '', 'Varnebroekerweg', 'Heerhugowaard', '2025-08-14T08:45:00+00'::timestamptz, '2026-01-01T12:00:00+00'::timestamptz),
  ('Voorburggracht', 'Voorburggracht 5, 1811JK Alkmaar', '#38bdf8', '1811JK', '5', '', 'Voorburggracht', 'Alkmaar', '2025-09-19T13:20:00+00'::timestamptz, '2025-08-20T09:15:00+00'::timestamptz),
  ('Achterwacht', 'Achterwacht 3, 1811LM Alkmaar', '#fb923c', '1811LM', '3', '', 'Achterwacht', 'Alkmaar', '2025-07-11T15:00:00+00'::timestamptz, '2026-02-07T14:08:00+00'::timestamptz),
  ('satelliet woning', 'N/A', '#94a3b8', '', '', '', '', '', '2026-04-01T08:00:00+00'::timestamptz, '2026-04-01T08:00:00+00'::timestamptz),
  ('satelliet woning', 'N/A', '#94a3b8', '', '', '', '', '', '2026-04-01T08:05:00+00'::timestamptz, '2026-04-01T08:05:00+00'::timestamptz),
  ('satelliet woning', 'N/A', '#94a3b8', '', '', '', '', '', '2026-04-01T08:10:00+00'::timestamptz, '2026-04-01T08:10:00+00'::timestamptz)
) as seed
where not exists (select 1 from public.locaties);

-- ============================================================================
-- gemeenten (Cli?nten module ? referentiedata, ~224 NL gemeenten)
-- ============================================================================

create table if not exists public.gemeenten (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create unique index if not exists gemeenten_naam_unique_active
  on public.gemeenten (lower(naam))
  where archived = false;

create index if not exists gemeenten_archived_idx on public.gemeenten (archived);

drop trigger if exists trg_gemeenten_set_modified on public.gemeenten;
create trigger trg_gemeenten_set_modified
  before update on public.gemeenten
  for each row execute function public.set_laatst_gewijzigd();

alter table public.gemeenten enable row level security;

drop policy if exists "anon kan gemeenten lezen" on public.gemeenten;
create policy "anon kan gemeenten lezen"
  on public.gemeenten for select to anon using (true);

drop policy if exists "anon kan gemeenten toevoegen" on public.gemeenten;
create policy "anon kan gemeenten toevoegen"
  on public.gemeenten for insert to anon with check (true);

drop policy if exists "anon kan gemeenten bewerken" on public.gemeenten;
create policy "anon kan gemeenten bewerken"
  on public.gemeenten for update to anon using (true) with check (true);

drop policy if exists "anon kan gemeenten verwijderen" on public.gemeenten;
create policy "anon kan gemeenten verwijderen"
  on public.gemeenten for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan gemeenten lezen" on public.gemeenten;
-- drop policy if exists "anon kan gemeenten toevoegen" on public.gemeenten;
-- drop policy if exists "anon kan gemeenten bewerken" on public.gemeenten;
-- drop policy if exists "anon kan gemeenten verwijderen" on public.gemeenten;
-- create policy "ingelogd kan gemeenten lezen"
--   on public.gemeenten for select to authenticated using (true);
-- create policy "ingelogd kan gemeenten toevoegen"
--   on public.gemeenten for insert to authenticated with check (true);
-- create policy "ingelogd kan gemeenten bewerken"
--   on public.gemeenten for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan gemeenten verwijderen"
--   on public.gemeenten for delete to authenticated using (true);

-- Seed van Nederlandse gemeenten + bijzondere ingangen (Ihub, WLZ, WMO, YOUZ).
-- Idempotent: alleen invoegen als de naam nog niet bestaat.
insert into public.gemeenten (naam)
select t.naam
from unnest(array[
  'Aa en Hunze','Aalsmeer','Aalten','Achtkarspelen','Alblasserdam','Albrandswaard',
  'Alkmaar','Almelo','Almere','Alphen aan den Rijn','Alphen-Chaam','Altena',
  'Ameland','Amersfoort','Amstelveen','Amsterdam','Apeldoorn','Arnhem',
  'Beek','Beekdaelen','Beesel','Berg en Dal','Bergeijk','Bergen (L)','Bergen (NH)',
  'Breda','Bronckhorst','Brummen','Bunnik','Bunschoten','Buren',
  'Capelle aan den IJssel','Castricum','Coevorden','Cranendonck','Cuijk','Culemborg',
  'Dalfsen','De Bilt','De Fryske Marren',
  'Elburg','Emmen','Enkhuizen','Enschede','Epe','Ermelo','Etten-Leur',
  'Geertruidenberg','Geldrop-Mierlo','Gemert-Bakel','Gennep','Gilze en Rijen',
  'Goeree-Overflakkee','Goes','Goirle','Gooise Meren','Gorinchem','Gouda','Grave',
  'Groningen','Gulpen-Wittem',
  'Haaksbergen','Haarlem','Haarlemmermeer','Halderberge','Hardenberg','Harderwijk',
  'Hardinxveld-Giessendam','Harlingen','Hattem','Heemskerk','Heemstede','Heerde',
  'Heerenveen','Heerlen','Heeze-Leende','Heiloo','Hellendoorn','Hellevoetsluis',
  'Helmond','Hendrik-Ido-Ambacht','Hengelo','Het Hogeland','Heumen','Heusden',
  'Hillegom','Hilvarenbeek','Hilversum','Hoeksche Waard','Hof van Twente',
  'Hollands Kroon','Hoogeveen','Hoorn','Horst aan de Maas','Houten','Huizen','Hulst',
  'Ihub','IJsselstein',
  'Kaag en Braassem','Kampen','Kapelle','Katwijk','Kerkrade','Koggenland',
  'Krimpen aan den IJssel','Krimpenerwaard',
  'Laarbeek','Landerd','Landgraaf','Landsmeer','Langedijk','Lansingerland','Laren',
  'Leeuwarden','Leiden','Leiderdorp','Leidschendam-Voorburg','Lingewaard','Lisse',
  'Lochem','Lopik','Loppersum','Losser',
  'Maasdriel','Maasgouw','Maashorst','Maassluis','Maastricht','Medemblik','Meerssen',
  'Meierijstad','Meppel','Middelburg','Midden-Delfland','Midden-Drenthe',
  'Midden-Groningen','Mill en Sint Hubert','Moerdijk','Molenlanden','Montferland',
  'Montfoort','Mook en Middelaar',
  'Neder-Betuwe','Nederweert','Nieuwegein','Nieuwkoop','Nijkerk','Nijmegen',
  'Nissewaard','Noardeast-Frysl?n','Noord-Beveland','Noordenveld','Noordoostpolder',
  'Noordwijk','Nuenen, Gerwen en Nederwetten','Nunspeet',
  'Oegstgeest','Oirschot','Oisterwijk','Oldambt','Oldebroek','Oldenzaal','Olst-Wijhe',
  'Ommen','Oost Gelre','Oostzaan','Opsterland','Oss','Oude IJsselstreek','Overbetuwe',
  'Peel en Maas','Putten',
  'Raalte','Renkum','Renswoude','Reusel-De Mierden','Rheden','Ridderkerk','Rijswijk',
  'Roerdalen','Roosendaal','Rozendaal',
  'Schagen','Schoolder','SED Stede Broec','Sliedrecht','Soest','Someren',
  'Son en Breugel','Stadskanaal','Steenbergen','Stein','S?dwest-Frysl?n',
  'Terschelling','Texel','Tiel','Twenterand',
  'Uitgeest','Utrecht',
  'Valkenswaard','Veendam','Velsen/Kennemerland','Venlo','Vianen','Vlaardingen','Vlagtwedde',
  'Wageningen','Waterland','Weesp','West-Betuwe','Wierden','Wijk bij Duurstede',
  'Winterswijk','WLZ','WMO','Woensdrecht',
  'YOUZ','YOUZ/Rotterdam',
  'Zaandam','Zeewolde','Zeist','Zoetermeer','Zwolle'
]) as t(naam)
where not exists (
  select 1 from public.gemeenten g where lower(g.naam) = lower(t.naam)
);

-- ============================================================================
-- Seed-data opleidingen (verplaatst van bovenaan; idempotent)
-- ============================================================================

insert into public.opleidingen (naam, skj)
select v.naam, false
from (values
  ('HAVO'),
  ('HBO Bachelor media en Entertainment (Media en Entertainment management)'),
  ('MBO4 Commercieel medewerker bank- en verzekeringswezen'),
  ('Faculteit der Maatschappij- en gedragswetenschappen'),
  ('MBO4 Apothekersassistent'),
  ('Certificaat - Dossier opbouw en ontslag'),
  ('Certificaat - Omgaan met verzuim voor leidinggevenden'),
  ('Certificaat - Timemanagement en zelfmanagement'),
  ('HBO Bachelor bedrijfskunde'),
  ('Beroepscoach'),
  ('MBO Sociaal- Maatschappelijk Dienstverlener'),
  ('Verdiepende training Beroepscode, Tuchtrecht & Beroepsethiek'),
  ('Sociaal pedagogisch werker 3 - kinderopvang'),
  ('Certificaat Basistraining Beroepscode Tuchtrecht beroepsethiek'),
  ('Certificaat training feitelijk en Zorgvuldig rapporteren'),
  ('MBO4 Sociaal Pedagogisch werker'),
  ('HBO Bachelor Sociaal Pedagogische Hulpverlening Propedeuse'),
  ('Bachelor Social Work'),
  ('HBO Bachelor Sociaal Pedagogische Hulpverlening'),
  ('MBO4 Doktersassistent'),
  ('HBO Bachelor Toegepaste Psychologie Propedeuse Bachelor'),
  ('HBO Bachelor Toegepaste Psychologie'),
  ('MBO4 Pedagogisch medewerker jeugdzorg'),
  ('HBO Social work'),
  ('MBO2 Diploma Gastvrouw'),
  ('MBO3 Zelfstandig werkende gastvrouw'),
  ('Certificaat EMV'),
  ('Certificaat Logistieke dienst'),
  ('VWO Diploma'),
  ('MBO4 Manager handel (Filiaalmanager)'),
  ('MBO4 Personeelsplanner'),
  ('Human Resource Management A'),
  ('MBO4 Legal, insurance & HR Services Specialist'),
  ('MBO4 Sociaal-Cultureel Werker'),
  ('HBO Sociaal Pedagogisch Hulpverlening'),
  ('HR Core Business Basis'),
  ('HBO Bachelor Pedagogiek Propedeuse bachelor (Educational Theory)'),
  ('Diploma HAVO'),
  ('Sociaal maatschappelijk dienstverlener'),
  ('HBO Bachelor Social Work Propedeuse bachelor'),
  ('Gespecialiseerd pedagogisch medewerker'),
  ('Verbindend Gezag en Geweldloos Verzet'),
  ('Preventiemedewerker'),
  ('Manualmaster Documenteren'),
  ('Meldcode, huiselijk geweld en kindermishandeling'),
  ('Vaardigheidsdiploma Machineschrijven'),
  ('Notuleren'),
  ('Wordperfect 4.2->5.1'),
  ('Vertrouwenspersoon'),
  ('Excel 2013 Gevorderd'),
  ('Dienstverlening- en gezondheidszorg'),
  ('Werken met de verwijsindex'),
  ('Diploma MBO3 Verzorgende IG'),
  ('MBO4 Pedagogisch medewerker 4 jeugdzorg'),
  ('WO Bachelor Psychologie'),
  ('WO Master Psychologie'),
  ('HBO Bachelor Sociaal pedagogisch Hulpverlening'),
  ('Diploma'),
  ('Certificaat Meldcode, huiselijk geweld en kindermishandeling'),
  ('Certificaat Girlstalk'),
  ('Diploma MBO4 Maatschappelijke zorg'),
  ('Omgaan met Agressie'),
  ('MBO4 Gespecialiseerd Pedagogisch medewerker'),
  ('VMBO diploma'),
  ('MBO4 Pedagogisch medewerker'),
  ('MBO4 Sociaal maatschappelijk dienstverlener'),
  ('MBO3 Verkoopspecialist detailhandel'),
  ('VMBO'),
  ('Agogisch medewerker GGZ')
) as v(naam)
where not exists (
  select 1 from public.opleidingen o where lower(o.naam) = lower(v.naam)
);

-- ============================================================================
-- medewerkers (HR module ? master entity)
-- ============================================================================
--
-- Pragmatische opzet: een paar zoekvelden expliciet als kolom (voor snelle
-- queries en filtering vanuit de DB), de rest zit in 'data jsonb'. Dit is
-- robuust tegen schemawijzigingen: nieuwe velden kunnen direct opgeslagen
-- worden zonder migratie.

create table if not exists public.medewerkers (
  id uuid primary key default gen_random_uuid(),
  voornaam text not null default '',
  achternaam text not null default '',
  email text,
  fase text default 'In dienst',
  dienstverband text,
  functie text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists medewerkers_email_idx on public.medewerkers (lower(email));
create index if not exists medewerkers_naam_idx on public.medewerkers (lower(achternaam), lower(voornaam));
create index if not exists medewerkers_archived_idx on public.medewerkers (archived);
create index if not exists medewerkers_fase_idx on public.medewerkers (fase);

drop trigger if exists trg_medewerkers_set_modified on public.medewerkers;
create trigger trg_medewerkers_set_modified
  before update on public.medewerkers
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerkers enable row level security;

drop policy if exists "anon kan medewerkers lezen" on public.medewerkers;
create policy "anon kan medewerkers lezen"
  on public.medewerkers for select to anon using (true);

drop policy if exists "anon kan medewerkers toevoegen" on public.medewerkers;
create policy "anon kan medewerkers toevoegen"
  on public.medewerkers for insert to anon with check (true);

drop policy if exists "anon kan medewerkers bewerken" on public.medewerkers;
create policy "anon kan medewerkers bewerken"
  on public.medewerkers for update to anon using (true) with check (true);

drop policy if exists "anon kan medewerkers verwijderen" on public.medewerkers;
create policy "anon kan medewerkers verwijderen"
  on public.medewerkers for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan medewerkers lezen" on public.medewerkers;
-- drop policy if exists "anon kan medewerkers toevoegen" on public.medewerkers;
-- drop policy if exists "anon kan medewerkers bewerken" on public.medewerkers;
-- drop policy if exists "anon kan medewerkers verwijderen" on public.medewerkers;
-- create policy "ingelogd kan medewerkers lezen"
--   on public.medewerkers for select to authenticated using (true);
-- create policy "ingelogd kan medewerkers toevoegen"
--   on public.medewerkers for insert to authenticated with check (true);
-- create policy "ingelogd kan medewerkers bewerken"
--   on public.medewerkers for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan medewerkers verwijderen"
--   on public.medewerkers for delete to authenticated using (true);

-- Geen seed-data: medewerkers worden door de gebruiker in de UI aangemaakt.

-- ============================================================================
-- clienten (Cli?nten module ? master entity)
-- ============================================================================
--
-- ID is text (geen uuid) zodat bestaande IDs als 'cl_342' blijven werken in
-- legacy data (beschikkingen verwijzen daarheen). Nieuwe records krijgen
-- client-side gegenereerde ID's (bv. 'cl_1746...').

create table if not exists public.clienten (
  id text primary key,
  voornaam text not null default '',
  achternaam text not null default '',
  clientnummer integer,
  locatie text,
  fase text default 'in zorg',
  gemeente text,
  organisatie text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create unique index if not exists clienten_clientnummer_unique_active
  on public.clienten (clientnummer)
  where archived = false and clientnummer is not null;

create index if not exists clienten_naam_idx on public.clienten (lower(achternaam), lower(voornaam));
create index if not exists clienten_archived_idx on public.clienten (archived);
create index if not exists clienten_fase_idx on public.clienten (fase);
create index if not exists clienten_locatie_idx on public.clienten (lower(locatie));
create index if not exists clienten_gemeente_idx on public.clienten (lower(gemeente));

drop trigger if exists trg_clienten_set_modified on public.clienten;
create trigger trg_clienten_set_modified
  before update on public.clienten
  for each row execute function public.set_laatst_gewijzigd();

alter table public.clienten enable row level security;

drop policy if exists "anon kan clienten lezen" on public.clienten;
create policy "anon kan clienten lezen"
  on public.clienten for select to anon using (true);

drop policy if exists "anon kan clienten toevoegen" on public.clienten;
create policy "anon kan clienten toevoegen"
  on public.clienten for insert to anon with check (true);

drop policy if exists "anon kan clienten bewerken" on public.clienten;
create policy "anon kan clienten bewerken"
  on public.clienten for update to anon using (true) with check (true);

drop policy if exists "anon kan clienten verwijderen" on public.clienten;
create policy "anon kan clienten verwijderen"
  on public.clienten for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan clienten lezen" on public.clienten;
-- drop policy if exists "anon kan clienten toevoegen" on public.clienten;
-- drop policy if exists "anon kan clienten bewerken" on public.clienten;
-- drop policy if exists "anon kan clienten verwijderen" on public.clienten;
-- create policy "ingelogd kan clienten lezen"
--   on public.clienten for select to authenticated using (true);
-- create policy "ingelogd kan clienten toevoegen"
--   on public.clienten for insert to authenticated with check (true);
-- create policy "ingelogd kan clienten bewerken"
--   on public.clienten for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan clienten verwijderen"
--   on public.clienten for delete to authenticated using (true);

-- Seed van 85 cli?nten. Idempotent: alleen invoegen als de id nog niet bestaat.
insert into public.clienten (id, voornaam, achternaam, clientnummer, locatie, fase, gemeente, organisatie)
select t.id, t.voornaam, t.achternaam, t.clientnummer, t.locatie, t.fase, t.gemeente, t.organisatie
from (values
  ('cl_342','Jalaysa','Jansen',342,'Voorburggracht','in zorg','Dijk en Waard',''),
  ('cl_341','Lisanne','de Zeeuw',341,'Leonard Bramerstraat','in zorg','Rotterdam',''),
  ('cl_337','Arsalan','Koula',337,'Voorburggracht','in zorg','Dijk en Waard',''),
  ('cl_221','Ronique','Thakoer',221,'Varnebroek','in zorg','Rotterdam','Youz'),
  ('cl_339','Haifaa','Alnakshbandi',339,'Voorburggracht','in zorg','Alkmaar',''),
  ('cl_326','Jordy','Lont',326,'Voorburggracht','in zorg','Den Helder',''),
  ('cl_335','Romano','Leone',335,'Varnebroek','in zorg','Alkmaar',''),
  ('cl_333','Bella','van Meurs',333,'Magdalenenstraat','in zorg','','Planet Young'),
  ('cl_327','Dylaila','Birney',327,'Magdalenenstraat','in zorg','','IHub'),
  ('cl_328','Maik','Meijerink',328,'Breedstraat','in zorg','Alkmaar',''),
  ('cl_330','Dana','Ligthart',330,'Voorburggracht','in aanvraag','Dijk en Waard',''),
  ('cl_331','Dano','de Wagt',331,'Breedstraat','in aanvraag','Dijk en Waard',''),
  ('cl_323','Kim','Duinhoven',323,'Varnebroek','in aanvraag','Alkmaar',''),
  ('cl_322','Nadia','Trela',322,'Voorburggracht','in aanvraag','Medemblik',''),
  ('cl_321','Oskar','Delendowski',321,'Magdalenenstraat','in zorg','',''),
  ('cl_324','Gianluca','Frangiamore de Sola',324,'Magdalenenstraat','in zorg','Bergen (NH)',''),
  ('cl_320','Divano','Vrij',320,'Voorburggracht','in zorg','Enkhuizen',''),
  ('cl_319','Elona','van Milligen',319,'','in zorg','YOUZ/Rotterdam','Youz'),
  ('cl_318','Destiny','Boot',318,'Varnebroek','in zorg','Alkmaar',''),
  ('cl_317','Shardely','Eybrecht',317,'Breedstraat','in zorg','Den Helder',''),
  ('cl_313','Sara','Kapli',313,'Magdalenenstraat','uit zorg','',''),
  ('cl_315','Tshayren','Landveld',315,'Magdalenenstraat','in zorg','YOUZ','Youz'),
  ('cl_216','Nikki','Boekel',216,'','in zorg','Dijk en Waard',''),
  ('cl_308','Dylan','Kauffman',308,'','uit zorg','Dijk en Waard',''),
  ('cl_311','Iris','Brouwer',311,'Voorburggracht','uit zorg','Texel',''),
  ('cl_90','Annabel','Dikmans',90,'','in zorg','Haarlemmermeer',''),
  ('cl_209','Sara','Ali',209,'','in zorg','YOUZ/Rotterdam','Youz'),
  ('cl_261','Lucas','Kortenhoeven',261,'','uit zorg','YOUZ/Rotterdam','Youz'),
  ('cl_108','Neshanti','di Perna',108,'Breedstraat','in zorg','','Gripzorg'),
  ('cl_297','Storm','Kueter',297,'Magdalenenstraat','in zorg','Leidschendam-Voorburg',''),
  ('cl_152','Roma','Baltus',152,'Breedstraat','uit zorg','','Gripzorg'),
  ('cl_198','Nouska','Westerbeek',198,'','in zorg','WMO',''),
  ('cl_267','Ricardo','Rens',267,'Varnebroek','in zorg','Rotterdam','Youz'),
  ('cl_204','Donique','de Nijs',204,'','in zorg','WMO',''),
  ('cl_301','Grace','de Moor',301,'Voorburggracht','in zorg','YOUZ','Youz'),
  ('cl_292','Lotte','Schuiling',292,'Voorburggracht','in zorg','Sliedrecht',''),
  ('cl_309','Danique','Rietveld',309,'Varnebroek','in zorg','Alkmaar',''),
  ('cl_176','Nora','Halbesma',176,'Voorburggracht','uit zorg','Alkmaar',''),
  ('cl_283','Mitch','Kloosterman',283,'Breedstraat','uit zorg','Velsen/Kennemerland',''),
  ('cl_181','Joeliza','van den Dool',181,'Voorburggracht','uit zorg','Dijk en Waard',''),
  ('cl_21','Jason','Beltzer',21,'Voorburggracht','uit zorg','Dijk en Waard',''),
  ('cl_246','Albina','Zeneli',246,'Voorburggracht','uit zorg','Dijk en Waard',''),
  ('cl_279','Elize','Jongebloed',279,'Magdalenenstraat','in zorg','Alkmaar',''),
  ('cl_172','No?lla','Duijvestijn',172,'Breedstraat','in zorg','Castricum',''),
  ('cl_171','Jay','Stevens',171,'Varnebroek','in zorg','Heiloo',''),
  ('cl_275','Danielle','Lamping',275,'Varnebroek','in zorg','Dijk en Waard',''),
  ('cl_293','Eliza','Zwart',293,'Breedstraat','in zorg','Heiloo',''),
  ('cl_259','Ro?l','Spiering',259,'Varnebroek','uit zorg','Uitgeest',''),
  ('cl_165','Cloe','Brown',165,'Varnebroek','in zorg','Castricum',''),
  ('cl_268','Jay Arnold','Buter',268,'Varnebroek','uit zorg','Dijk en Waard',''),
  ('cl_291','Jorgia','Schoenmaker',291,'Magdalenenstraat','in zorg','Zaanstad',''),
  ('cl_281','Colin','Wijngaard',281,'Varnebroek','in zorg','SED Stede Broec',''),
  ('cl_228','Silas','Breederveld',228,'Magdalenenstraat','in zorg','Thub','IHub'),
  ('cl_290','Deborah','van den Eijnden',290,'Magdalenenstraat','uit zorg','Beverwijk',''),
  ('cl_276','Dion','Martis Abukar',276,'Voorburggracht','uit zorg','Beverwijk',''),
  ('cl_85','Jamey','Hofman',85,'','in zorg','Den Helder',''),
  ('cl_300','Manaf','Ghallab',300,'Voorburggracht','in zorg','Hollands Kroon',''),
  ('cl_284','Elin','Verburg',284,'Voorburggracht','uit zorg','Alkmaar',''),
  ('cl_177','Danischa','de Vilder',177,'satelliet woning','in zorg','Dijk en Waard',''),
  ('cl_12','Dries','Dekker',12,'Magdalenenstraat','in zorg','Dijk en Waard',''),
  ('cl_269','Kiyaro','Lambert',269,'Breedstraat','in zorg','Dijk en Waard',''),
  ('cl_199','Phobek','Mityaniq',199,'Breedstraat','in zorg','WLZ',''),
  ('cl_196','Linda','Otto',196,'satelliet woning','in zorg','WLZ',''),
  ('cl_197','Nino','Joosten',197,'Breedstraat','in zorg','WLZ',''),
  ('cl_184','Raymond','Ader',184,'Breedstraat','in zorg','WLZ',''),
  ('cl_203','Ahmet','Kat',203,'','uit zorg','WLZ',''),
  ('cl_250','Tycho','Kauffman',250,'Breedstraat','in zorg','Alkmaar','Gripzorg'),
  ('cl_234','Oliver','Schoenmakers',234,'Magdalenenstraat','in zorg','Alkmaar','Gripzorg'),
  ('cl_103','Shufrandly','Faries',103,'Breedstraat','uit zorg','Dijk en Waard','Gripzorg'),
  ('cl_253','Sayed','Danish',253,'Breedstraat','uit zorg','Alkmaar','Gripzorg'),
  ('cl_225','Tamaika','Cooks',225,'Magdalenenstraat','in zorg','','Gripzorg'),
  ('cl_237','Mahesh','Don',237,'Breedstraat','uit zorg','WLZ',''),
  ('cl_178','Denisha','Wortel',178,'Breedstraat','in zorg','','Gripzorg'),
  ('cl_206','Shadena','Bauman',206,'Magdalenenstraat','in zorg','Schagen',''),
  ('cl_302','Sara','Narouz',302,'Magdalenenstraat','in zorg','Schagen',''),
  ('cl_58','Mitchel','Heijm',58,'Breedstraat','in zorg','Ouder-Amstel',''),
  ('cl_278','Pelle','van Stee',278,'Magdalenenstraat','in zorg','Schagen',''),
  ('cl_188','Joyce','Voetel',188,'Magdalenenstraat','in zorg','SED Stede Broec',''),
  ('cl_235','Diboya','Boerlijst',235,'Magdalenenstraat','in zorg','SED Stede Broec',''),
  ('cl_200','Jira','Tharwarmporn',200,'satelliet woning','in zorg','WLZ','')
) as t(id, voornaam, achternaam, clientnummer, locatie, fase, gemeente, organisatie)
where not exists (
  select 1 from public.clienten c where c.id = t.id
);


-- ============================================================================
-- client_documents (Cli?ntdossier ? Documenten-tab)
-- ============================================================================
--
-- Eigen tabel zodat:
--  1) bestanden niet als jsonb-blob in de cli?nt-rij meereizen (PostgREST heeft
--     een ~1MB request-body limiet die bij grote PDFs/foto's onzichtbaar
--     mislukt en het bestand stilletjes laat verdwijnen na refresh).
--  2) een mislukte upload nooit andere cli?nt-edits overschrijft.
--  3) per-document delete/update een goedkope rij-operatie is.
--
-- file_data houdt het bestand als base64 data-URL ("data:<mime>;base64,...").
-- Voor bestanden > ~1MB kan later gemigreerd worden naar Supabase Storage; de
-- frontend werkt al via een data-laag, dus dat is dan alleen een
-- implementatiewissel.
--
-- client_id is text en heeft geen harde FK naar clienten(id) zodat legacy
-- test-IDs blijven werken (zelfde patroon als beschikkingen).

create table if not exists public.client_documents (
  id text primary key,
  client_id text not null,
  naam text not null default '',
  type text default '',
  vervaldatum text default '',
  uploaddatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  archived boolean not null default false,
  file_name text default '',
  file_mime text default '',
  file_data text default '',          -- legacy base64-veld; blijft 1× voor migratie
  storage_path text                   -- nieuwe: pad in storage-bucket "client-documents"
);

create index if not exists client_documents_client_id_idx on public.client_documents (client_id);
create index if not exists client_documents_archived_idx on public.client_documents (archived);
create index if not exists client_documents_type_idx on public.client_documents (lower(type));
create index if not exists client_documents_storage_path_idx
  on public.client_documents (storage_path)
  where storage_path is not null;

drop trigger if exists trg_client_documents_set_modified on public.client_documents;
create trigger trg_client_documents_set_modified
  before update on public.client_documents
  for each row execute function public.set_laatst_gewijzigd();

alter table public.client_documents enable row level security;

drop policy if exists "anon kan client_documents lezen" on public.client_documents;
create policy "anon kan client_documents lezen"
  on public.client_documents for select to anon using (true);

drop policy if exists "anon kan client_documents toevoegen" on public.client_documents;
create policy "anon kan client_documents toevoegen"
  on public.client_documents for insert to anon with check (true);

drop policy if exists "anon kan client_documents bewerken" on public.client_documents;
create policy "anon kan client_documents bewerken"
  on public.client_documents for update to anon using (true) with check (true);

drop policy if exists "anon kan client_documents verwijderen" on public.client_documents;
create policy "anon kan client_documents verwijderen"
  on public.client_documents for delete to anon using (true);


-- ============================================================================
-- beschikkingen (Cli?nten module ? master entity)
-- ============================================================================
--
-- Soft FK naar clienten via client_id (text). Geen harde FK constraint, want we
-- willen legacy "test"-IDs (cl_99999, cl_99820, ?) kunnen behouden zonder de
-- referentie te breken. Lookups gaan via cache (clienten-data.js).
--
-- Veel van de financi?le velden zijn explicit numeric kolommen voor snelle
-- aggregaties (dashboard). Overige meta gaat in 'data jsonb'.

create table if not exists public.beschikkingen (
  id text primary key,
  client_id text,
  naam text not null default '',
  zorgsoort_key text not null default 'overig',
  fase text not null default 'actief',
  locatie text,
  start_iso date,
  eind_iso date,
  decl_meth text not null default 'ONS',
  tarief_eur numeric(12,2) not null default 0,
  tarief_eenheid text not null default 'uur' check (tarief_eenheid in ('uur','dag','week')),
  betalings_status text not null default 'outstanding' check (betalings_status in ('betaald','outstanding')),
  te_declareren_lm numeric(14,2) not null default 0,
  nog_niet_gedeclareerd numeric(14,2) not null default 0,
  gedecl_gemeente_in_behandeling numeric(14,2) not null default 0,
  betaald_cumulatief numeric(14,2) not null default 0,
  betaling_ref_maand text,
  gearchiveerd boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists beschikkingen_client_id_idx on public.beschikkingen (client_id);
create index if not exists beschikkingen_fase_idx on public.beschikkingen (fase);
create index if not exists beschikkingen_zorgsoort_idx on public.beschikkingen (zorgsoort_key);
create index if not exists beschikkingen_archived_idx on public.beschikkingen (gearchiveerd);
create index if not exists beschikkingen_eind_iso_idx on public.beschikkingen (eind_iso);
create index if not exists beschikkingen_betalings_status_idx on public.beschikkingen (betalings_status);

drop trigger if exists trg_beschikkingen_set_modified on public.beschikkingen;
create trigger trg_beschikkingen_set_modified
  before update on public.beschikkingen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.beschikkingen enable row level security;

drop policy if exists "anon kan beschikkingen lezen" on public.beschikkingen;
create policy "anon kan beschikkingen lezen"
  on public.beschikkingen for select to anon using (true);

drop policy if exists "anon kan beschikkingen toevoegen" on public.beschikkingen;
create policy "anon kan beschikkingen toevoegen"
  on public.beschikkingen for insert to anon with check (true);

drop policy if exists "anon kan beschikkingen bewerken" on public.beschikkingen;
create policy "anon kan beschikkingen bewerken"
  on public.beschikkingen for update to anon using (true) with check (true);

drop policy if exists "anon kan beschikkingen verwijderen" on public.beschikkingen;
create policy "anon kan beschikkingen verwijderen"
  on public.beschikkingen for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan beschikkingen lezen" on public.beschikkingen;
-- drop policy if exists "anon kan beschikkingen toevoegen" on public.beschikkingen;
-- drop policy if exists "anon kan beschikkingen bewerken" on public.beschikkingen;
-- drop policy if exists "anon kan beschikkingen verwijderen" on public.beschikkingen;
-- create policy "ingelogd kan beschikkingen lezen"
--   on public.beschikkingen for select to authenticated using (true);
-- create policy "ingelogd kan beschikkingen toevoegen"
--   on public.beschikkingen for insert to authenticated with check (true);
-- create policy "ingelogd kan beschikkingen bewerken"
--   on public.beschikkingen for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan beschikkingen verwijderen"
--   on public.beschikkingen for delete to authenticated using (true);

-- Seed van 100 beschikkingen (uit beschikkingen-besc-bulk.js v2). Idempotent
-- via "on conflict do nothing"; cli?ntlabels worden at-runtime opgehaald uit
-- de clienten-cache (clienten-data.js ? data.clientLabelOverride als override).
insert into public.beschikkingen (
  id, client_id, naam, zorgsoort_key, fase, start_iso, eind_iso,
  tarief_eur, tarief_eenheid, decl_meth, te_declareren_lm,
  nog_niet_gedeclareerd, betalings_status, betaling_ref_maand, data
)
values
  ('b_besc_001', 'cl_322', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_002', 'cl_326', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 357.84, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_003', 'cl_326', 'Ambulant', 'amb', 'actief', NULL, NULL, 90.6, 'uur', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_004', 'cl_330', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'outstanding', NULL, '{}'::jsonb),
  ('b_besc_005', 'cl_335', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_006', 'cl_335', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 376.19, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_007', 'cl_331', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_008', 'cl_328', 'verblijf en behandeling', 'veb', 'actief', '2026-01-09', '2026-07-08', 376.19, 'dag', 'ONS', 9780.94, 19730.33, 'betaald', '2026-01', '{}'::jsonb),
  ('b_besc_009', 'cl_279', 'Ambulant', 'amb', 'actief', NULL, NULL, 86.4, 'uur', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_010', 'cl_327', 'Gecombineerd', 'geo', 'verlopen', '2025-12-23', '2026-01-04', 357.85, 'week', 'ONS', 0, 0, 'outstanding', '2025-12', '{}'::jsonb),
  ('b_besc_011', 'cl_261', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_012', 'cl_333', 'ambulant en verblijf', 'geo', 'actief', '2025-12-23', '2026-03-23', 14728, 'week', 'Handmatig', 0, 0, 'outstanding', '2025-12', '{}'::jsonb),
  ('b_besc_013', 'cl_328', 'ambulant 24 u / week gedurende 4 weken', 'amb', 'actief', '2025-12-11', '2026-03-08', 86.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-12', '{}'::jsonb),
  ('b_besc_014', 'cl_328', 'crisis 4 weken', 'veb', 'verlopen', '2025-12-11', '2026-01-07', 290, 'dag', 'ONS', 0, 1968.4, 'betaald', '2025-12', '{}'::jsonb),
  ('b_besc_015', 'cl_330', 'ambulant 10 u / dag', 'amb', 'in_aanvraag', '2025-12-15', '2026-12-10', 86.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-12', '{}'::jsonb),
  ('b_besc_016', 'cl_330', 'verblijf', 'veb', 'in_aanvraag', '2025-12-15', '2026-12-10', 357.84, 'dag', 'ONS', 9303.84, 20543.71, 'betaald', '2025-12', '{}'::jsonb),
  ('b_besc_017', 'cl_331', 'ambulant 10 u / dag', 'amb', 'in_aanvraag', '2025-12-15', '2026-12-10', 86.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-12', '{}'::jsonb),
  ('b_besc_018', 'cl_331', 'verblijf', 'veb', 'in_aanvraag', '2025-12-15', '2026-12-10', 357.84, 'dag', 'ONS', 0, 0, 'betaald', '2025-12', '{}'::jsonb),
  ('b_besc_019', 'cl_323', 'beschikking wordt afgegeven door alkmaar', 'veb', 'in_aanvraag', '2025-11-28', '2026-06-11', 357.84, 'dag', 'ONS', 9303.84, 15928.49, 'betaald', '2025-11', '{}'::jsonb),
  ('b_besc_020', 'cl_322', 'verblijf vanaf 7 november', 'veb', 'in_aanvraag', NULL, NULL, 357, 'dag', 'ONS', 9282, 31010.28, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_021', 'cl_321', 'beschikking ambulant vanuit Timon', 'amb', 'in_aanvraag', NULL, NULL, 86.4, 'uur', 'Handmatig', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_022', 'cl_292', 'verblijf behandel vanaf 4/11 in aanvraag', 'veb', 'in_zorg', '2025-11-03', '2026-11-02', 381, 'dag', 'ONS', 9906, 56388, 'betaald', '2025-11', '{}'::jsonb),
  ('b_besc_023', 'cl_321', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'outstanding', NULL, '{}'::jsonb),
  ('b_besc_024', 'cl_319', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{"clientLabelOverride":"Elana van Milligen"}'::jsonb),
  ('b_besc_025', 'cl_324', 'ambulant 10 u / dag.', 'amb', 'actief', '2025-11-25', '2026-01-10', 86.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-11', '{}'::jsonb),
  ('b_besc_026', 'cl_99820', 'Verblijf en behandeling', 'veb', 'verlopen', '2024-01-01', '2024-12-01', 357.84, 'dag', 'ONS', 0, 0, 'betaald', '2024-01', '{"clientLabelOverride":"Jimmy Toemen"}'::jsonb),
  ('b_besc_027', 'cl_324', 'Verblijf en behandeling', 'veb', 'actief', '2025-11-25', '2026-07-09', 357.84, 'dag', 'ONS', 9303.84, 20543.71, 'betaald', '2025-11', '{}'::jsonb),
  ('b_besc_028', 'cl_206', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 235.08, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{"clientLabelOverride":"Shadena Bouman"}'::jsonb),
  ('b_besc_029', 'cl_320', 'verblijf en behandeling', 'veb', 'actief', '2025-10-16', '2026-03-18', 357.84, 'dag', 'ONS', 0, 16182.72, 'betaald', '2025-10', '{}'::jsonb),
  ('b_besc_030', 'cl_302', 'verlenging vanaf 18-11', 'veb', 'actief', '2025-11-30', '2026-05-14', 285.22, 'dag', 'ONS', 7415.72, 9653.99, 'betaald', '2025-11', '{"clientLabelOverride":"Sara Norouz"}'::jsonb),
  ('b_besc_031', 'cl_315', 'Gecombineerd', 'geo', 'actief', '2025-10-13', '2025-12-19', 7352, 'week', 'ONS', 0, 0, 'outstanding', '2025-10', '{}'::jsonb),
  ('b_besc_032', 'cl_228', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'outstanding', NULL, '{}'::jsonb),
  ('b_besc_033', 'cl_313', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_034', 'cl_209', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_035', 'cl_267', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'outstanding', NULL, '{}'::jsonb),
  ('b_besc_036', 'cl_261', 'Gecombineerd', 'veb', 'verlopen', '2024-01-01', '2024-01-01', 0.01, 'dag', 'ONS', 0, 0, 'outstanding', '2024-01', '{"clientLabelOverride":"Lucas Kortenhoeven"}'::jsonb),
  ('b_besc_037', 'cl_301', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_038', 'cl_276', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_039', 'cl_291', 'Gecombineerd', 'geo', 'actief', NULL, NULL, 0, 'week', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_040', 'cl_319', 'van 08-10-2025 tot 30-10-2025 in zorg', 'geo', 'verlopen', '2025-10-07', '2025-10-29', 1, 'week', 'Handmatig', 0, 0, 'outstanding', '2025-10', '{"clientLabelOverride":"Elana van Milligen"}'::jsonb),
  ('b_besc_041', 'cl_225', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 206.56, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_042', 'cl_209', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 0, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_043', 'cl_267', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 0, 'dag', 'ONS', 0, 0, 'outstanding', NULL, '{}'::jsonb),
  ('b_besc_044', 'cl_301', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 0, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_045', 'cl_253', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 206.56, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_046', 'cl_281', 'Indicatie wonen vanaf 21 okt.', 'veb', 'actief', '2025-10-21', '2026-04-19', 334.3, 'dag', 'ONS', 6351.7, 19723.7, 'betaald', '2025-10', '{}'::jsonb),
  ('b_besc_047', 'cl_235', 'Verblijf en behandeling', 'veb', 'verlopen', '2025-09-30', '2025-12-31', 334.3, 'dag', 'ONS', 0, 0, 'betaald', '2025-09', '{}'::jsonb),
  ('b_besc_048', 'cl_184', 'WLZ 14 u week', 'wlz', 'actief', '2025-01-01', '2025-12-31', 77, 'uur', 'WLZ', 0, 5056.59, 'betaald', '2025-01', '{}'::jsonb),
  ('b_besc_049', 'cl_197', 'WLZ 13.25u week', 'wlz', 'actief', '2025-01-01', '2025-12-31', 77, 'uur', 'WLZ', 0, 5993.68, 'betaald', '2025-01', '{}'::jsonb),
  ('b_besc_050', 'cl_237', 'WLZ 21 u/ week', 'wlz', 'actief', '2025-01-01', '2025-12-31', 77, 'uur', 'WLZ', 0, 19852.14, 'betaald', '2025-01', '{}'::jsonb),
  ('b_besc_051', 'cl_203', 'wlz', 'wlz', 'verlopen', '2023-12-01', '2023-12-31', 77, 'uur', 'WLZ', 0, 0, 'betaald', '2023-12', '{"clientLabelOverride":"Ahmet Kat"}'::jsonb),
  ('b_besc_052', 'cl_200', 'WLZ indicatie 12.5 u / week', 'wlz', 'actief', '2025-10-01', '2025-12-29', 77, 'uur', 'WLZ', 0, 2637.25, 'betaald', '2025-10', '{}'::jsonb),
  ('b_besc_053', 'cl_199', 'WLZ indicatie Phabek 13 u / week', 'wlz', 'actief', '2024-12-31', '2025-12-31', 77, 'uur', 'WLZ', 0, 12037.41, 'betaald', '2024-12', '{"clientLabelOverride":"Phabek Mityaniq"}'::jsonb),
  ('b_besc_054', 'cl_196', 'WLZ 7.5 u / week', 'wlz', 'actief', '2024-12-29', '2025-12-29', 77, 'uur', 'WLZ', 0, 5082, 'betaald', '2024-12', '{}'::jsonb),
  ('b_besc_055', 'cl_318', 'verblijf en behandeling', 'veb', 'actief', '2025-10-03', '2026-04-02', 357.84, 'dag', 'ONS', 715.68, 20543.71, 'betaald', '2025-10', '{}'::jsonb),
  ('b_besc_056', 'cl_99999', 'Test beschikking', 'amb', 'actief', '2024-12-31', '2025-11-26', 10, 'uur', 'Handmatig', 0, 0, 'betaald', '2024-12', '{"clientLabelOverride":"Test Cli?nt"}'::jsonb),
  ('b_besc_057', 'cl_317', 'Verblijf en behandeling', 'veb', 'actief', '2025-09-23', '2026-04-06', 357.84, 'dag', 'ONS', 2147.04, 20692.56, 'betaald', '2025-09', '{}'::jsonb),
  ('b_besc_058', 'cl_261', 'youz', 'veb', 'verlopen', '2024-07-01', '2025-10-03', 513.28, 'dag', 'Handmatig', 0, 0, 'outstanding', '2024-07', '{"clientLabelOverride":"Lucas Kortenhoeven"}'::jsonb),
  ('b_besc_059', 'cl_209', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 0, 'dag', 'Handmatig', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_060', 'cl_301', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 0, 'dag', 'Handmatig', 0, 0, 'outstanding', NULL, '{}'::jsonb),
  ('b_besc_061', 'cl_99821', 'Verblijf en behandeling', 'veb', 'verlopen', '2025-04-24', '2025-09-05', 206.56, 'dag', 'Handmatig', 0, 0, 'betaald', '2025-04', '{"clientLabelOverride":"Santi Veenendaal Sepulveda"}'::jsonb),
  ('b_besc_062', 'cl_225', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 206.56, 'dag', 'Handmatig', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_063', 'cl_178', 'Verblijf en behandeling', 'veb', 'actief', NULL, NULL, 357.84, 'dag', 'ONS', 0, 0, 'betaald', NULL, '{}'::jsonb),
  ('b_besc_064', 'cl_313', 'via enver', 'veb', 'verlopen', '2025-06-10', '2025-07-02', 111, 'dag', 'Handmatig', 0, 0, 'outstanding', '2025-06', '{}'::jsonb),
  ('b_besc_065', 'cl_12', 'fasehuis', 'veb', 'actief', '2025-04-15', '2026-06-11', 206.56, 'dag', 'Handmatig', 5370.56, 0, 'outstanding', '2025-04', '{}'::jsonb),
  ('b_besc_066', 'cl_315', 'handmatig', 'geo', 'verlopen', '2025-08-11', '2025-10-11', 7649.01, 'week', 'Handmatig', 0, 0, 'outstanding', '2025-08', '{}'::jsonb),
  ('b_besc_067', 'cl_216', 'ambulant', 'amb', 'actief', '2025-07-01', '2025-10-31', 72, 'uur', 'ONS', 0, 0, 'betaald', '2025-07', '{}'::jsonb),
  ('b_besc_068', 'cl_152', 'fasewonen', 'veb', 'actief', '2025-02-06', '2026-02-09', 206.56, 'dag', 'Handmatig', 0, 0, 'outstanding', '2025-02', '{}'::jsonb),
  ('b_besc_069', 'cl_108', 'fasewonen', 'veb', 'actief', '2024-09-14', '2026-01-10', 206.56, 'dag', 'Handmatig', 0, 0, 'betaald', '2024-09', '{}'::jsonb),
  ('b_besc_070', 'cl_267', '3634,62 per week', 'veb', 'actief', '2025-06-26', '2026-03-29', 501.43, 'dag', 'Handmatig', 0, 0, 'outstanding', '2025-06', '{"clientLabelOverride":"Ricardo Rens"}'::jsonb),
  ('b_besc_071', 'cl_228', 'bepaling jeugdhulp eindd 05042026', 'veb', 'actief', '2026-01-01', '2026-04-02', 357.76, 'dag', 'Handmatig', 715.52, 32198.4, 'betaald', '2026-01', '{}'::jsonb),
  ('b_besc_072', 'cl_228', 'fasewonen ihub', 'veb', 'actief', '2024-04-07', '2025-11-30', 357.76, 'dag', 'Handmatig', 0, 0, 'outstanding', '2024-04', '{}'::jsonb),
  ('b_besc_073', 'cl_234', 'fasewonen', 'veb', 'in_aanvraag', '2025-08-01', '2025-09-30', 206.56, 'dag', 'Handmatig', 0, 0.1, 'outstanding', '2025-08', '{}'::jsonb),
  ('b_besc_074', 'cl_234', 'fasewonen', 'veb', 'verlopen', '2024-05-02', '2025-07-31', 206.56, 'dag', 'Handmatig', 0, 0, 'outstanding', '2024-05', '{}'::jsonb),
  ('b_besc_075', 'cl_250', 'fasewonen', 'veb', 'actief', '2024-06-15', '2025-11-25', 206.56, 'dag', 'Handmatig', 0, 0, 'outstanding', '2024-06', '{}'::jsonb),
  ('b_besc_076', 'cl_253', 'fasewonen', 'veb', 'actief', '2025-03-08', '2025-12-30', 206.56, 'dag', 'Handmatig', 0, 0, 'outstanding', '2025-03', '{}'::jsonb),
  ('b_besc_077', 'cl_103', 'fasewonen', 'veb', 'actief', '2024-01-07', '2025-10-22', 206.56, 'dag', 'Handmatig', 0, 0, 'betaald', '2024-01', '{"clientLabelOverride":"Shufrandly Faries"}'::jsonb),
  ('b_besc_078', 'cl_308', 'Ambulant', 'amb', 'verlopen', '2025-05-31', '2025-06-30', 91.8, 'uur', 'ONS', 0, 0, 'betaald', '2025-05', '{}'::jsonb),
  ('b_besc_079', 'cl_311', 'Verblijf en behandeling', 'veb', 'verlopen', '2025-05-09', '2025-08-09', 357.86, 'dag', 'ONS', 0, 0, 'betaald', '2025-05', '{}'::jsonb),
  ('b_besc_080', 'cl_311', 'Ambulant', 'amb', 'verlopen', '2025-05-08', '2025-08-08', 86.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-05', '{}'::jsonb),
  ('b_besc_081', 'cl_225', 'Ambulant', 'amb', 'actief', '2025-06-20', '2026-07-30', 72, 'uur', 'ONS', 0, 0, 'betaald', '2025-06', '{}'::jsonb),
  ('b_besc_082', 'cl_278', 'Ambulant', 'amb', 'actief', '2025-06-28', '2026-01-09', 95.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-06', '{}'::jsonb),
  ('b_besc_083', 'cl_284', 'Verblijf en behandeling', 'veb', 'actief', '2025-05-16', '2025-07-03', 357.84, 'dag', 'ONS', 0, 0, 'betaald', '2025-05', '{}'::jsonb),
  ('b_besc_084', 'cl_284', 'Ambulant', 'amb', 'actief', '2025-06-02', '2025-07-03', 86.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-06', '{}'::jsonb),
  ('b_besc_085', 'cl_188', 'Verblijf en behandeling', 'veb', 'actief', '2025-01-01', '2025-12-31', 313.94, 'dag', 'ONS', 0, 0, 'outstanding', '2025-01', '{}'::jsonb),
  ('b_besc_086', 'cl_198', 'Ambulant', 'amb', 'actief', '2025-03-12', '2026-09-06', 66, 'uur', 'ONS', 0, 0, 'betaald', '2025-03', '{"clientLabelOverride":"Nouska Westerbeek"}'::jsonb),
  ('b_besc_087', 'cl_178', 'Verblijf en behandeling', 'veb', 'actief', '2025-02-18', '2026-02-18', 206.56, 'dag', 'Handmatig', 0, 0, 'outstanding', '2025-02', '{}'::jsonb),
  ('b_besc_088', 'cl_246', 'Verblijf en behandeling', 'veb', 'verlopen', '2024-05-31', '2025-04-29', 357.84, 'dag', 'ONS', 0, 0, 'betaald', '2024-05', '{}'::jsonb),
  ('b_besc_089', 'cl_293', 'Verblijf en behandeling', 'veb', 'actief', '2025-01-16', '2027-01-29', 357.84, 'dag', 'ONS', 9303.84, 14818.27, 'betaald', '2025-01', '{"clientLabelOverride":"Eliza Zwart"}'::jsonb),
  ('b_besc_090', 'cl_172', 'Verblijf en behandeling (Castricum)', 'veb', 'actief', '2025-02-04', '2026-02-26', 357.84, 'dag', 'ONS', 0, 8734.99, 'betaald', '2025-02', '{}'::jsonb),
  ('b_besc_091', 'cl_172', 'Ambulant (alkmaar)', 'amb', 'actief', '2025-05-16', '2026-08-16', 72, 'uur', 'ONS', 0, 0, 'betaald', '2025-05', '{}'::jsonb),
  ('b_besc_092', 'cl_309', 'Verblijf en behandeling', 'veb', 'actief', '2025-02-25', '2026-02-28', 357.84, 'dag', 'ONS', 0, 9092.83, 'betaald', '2025-02', '{"clientLabelOverride":"Danique Rietveld"}'::jsonb),
  ('b_besc_093', 'cl_297', 'Ambulant', 'amb', 'in_aanvraag', '2025-07-19', '2025-12-02', 87, 'uur', 'ONS', 0, 0, 'betaald', '2025-07', '{"clientLabelOverride":"Storm Kueter"}'::jsonb),
  ('b_besc_094', 'cl_99901', 'Verblijf en behandeling', 'veb', 'actief', '2025-01-01', '2026-06-22', 341.08, 'dag', 'ONS', 8868.08, 20123.72, 'betaald', '2025-01', '{"clientLabelOverride":"Yassir Maalin"}'::jsonb),
  ('b_besc_095', 'cl_276', 'Verblijf en behandeling', 'veb', 'actief', '2024-12-31', '2026-06-30', 341, 'dag', 'ONS', 8866, 14649.96, 'betaald', '2024-12', '{}'::jsonb),
  ('b_besc_096', 'cl_276', 'Ambulant', 'amb', 'actief', '2025-09-01', '2025-12-31', 77.4, 'uur', 'ONS', 0, 0, 'betaald', '2025-09', '{}'::jsonb),
  ('b_besc_097', 'cl_21', 'Verblijf en behandeling', 'veb', 'verlopen', '2024-12-31', '2025-03-31', 357.84, 'dag', 'ONS', 0, 0, 'betaald', '2024-12', '{"clientLabelOverride":"Jason Beltzer"}'::jsonb),
  ('b_besc_098', 'cl_235', 'Verblijf en behandeling', 'veb', 'verlopen', '2025-04-04', '2025-09-29', 318.68, 'dag', 'ONS', 0, 0, 'betaald', '2025-04', '{"clientLabelOverride":"Diboya Boerlijst"}'::jsonb),
  ('b_besc_099', 'cl_206', 'Verblijf en behandeling', 'veb', 'verlopen', '2025-03-17', '2025-11-14', 235.08, 'dag', 'ONS', 0, 0, 'betaald', '2025-03', '{"clientLabelOverride":"Shadena Bauman"}'::jsonb),
  ('b_besc_100', 'cl_165', 'Verblijf en behandeling', 'veb', 'verlopen', '2025-05-05', '2025-06-01', 357.84, 'dag', 'ONS', 0, 0, 'betaald', '2025-05', '{}'::jsonb)
on conflict (id) do nothing;


-- ============================================================================
-- facturen (Cli?nten module ? master entity, soft FK naar clienten)
-- ============================================================================
--
-- De source data komt uit facturen-bulk.js (956 records). Velden worden 1-op-1
-- overgenomen, plus een uniek id en een numeric bedrag-kolom voor sortering en
-- aggregatie. Status, periode en betaling-tekst blijven als display-strings
-- bewaard (parsing kan later toegevoegd worden zonder schemamigratie).

create table if not exists public.facturen (
  id text primary key,
  factuurnummer text not null default '',
  beschikking_label text not null default '',
  client_label text not null default '',
  client_id text,
  clientnummer text,
  periode text not null default '',
  betaling_text text not null default '',
  status text not null default '',
  bedrag numeric(14,2) not null default 0,
  gearchiveerd boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists facturen_factuurnummer_idx on public.facturen (factuurnummer);
create index if not exists facturen_client_id_idx on public.facturen (client_id);
create index if not exists facturen_clientnummer_idx on public.facturen (clientnummer);
create index if not exists facturen_status_idx on public.facturen (status);
create index if not exists facturen_archived_idx on public.facturen (gearchiveerd);

drop trigger if exists trg_facturen_set_modified on public.facturen;
create trigger trg_facturen_set_modified
  before update on public.facturen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.facturen enable row level security;

drop policy if exists "anon kan facturen lezen" on public.facturen;
create policy "anon kan facturen lezen"
  on public.facturen for select to anon using (true);

drop policy if exists "anon kan facturen toevoegen" on public.facturen;
create policy "anon kan facturen toevoegen"
  on public.facturen for insert to anon with check (true);

drop policy if exists "anon kan facturen bewerken" on public.facturen;
create policy "anon kan facturen bewerken"
  on public.facturen for update to anon using (true) with check (true);

drop policy if exists "anon kan facturen verwijderen" on public.facturen;
create policy "anon kan facturen verwijderen"
  on public.facturen for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan facturen lezen" on public.facturen;
-- drop policy if exists "anon kan facturen toevoegen" on public.facturen;
-- drop policy if exists "anon kan facturen bewerken" on public.facturen;
-- drop policy if exists "anon kan facturen verwijderen" on public.facturen;
-- create policy "ingelogd kan facturen lezen"
--   on public.facturen for select to authenticated using (true);
-- create policy "ingelogd kan facturen toevoegen"
--   on public.facturen for insert to authenticated with check (true);
-- create policy "ingelogd kan facturen bewerken"
--   on public.facturen for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan facturen verwijderen"
--   on public.facturen for delete to authenticated using (true);

-- Seed van 956 facturen (uit facturen-bulk.js). Idempotent via on conflict.
insert into public.facturen (
  id, factuurnummer, beschikking_label, client_label, client_id,
  clientnummer, periode, betaling_text, status, bedrag
)
values
  ('f_0001', '20260026', 'Gecombineerd', 'Silas Breederveld', 'cl_228', '228', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 13373),
  ('f_0002', '20260023', 'Verblijf en behandeling', 'Denisha Wortel', 'cl_178', '178', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 6732),
  ('f_0003', '20260027', 'ambulant en verblijf', 'Bella van Meurs', 'cl_333', '333', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 79512.83),
  ('f_0004', '20260028', 'Gecombineerd', 'Oskar Delendowski', 'cl_321', '321', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 29496.92),
  ('f_0005', '20260025', 'fasewonen', 'Neshanti di Perna', 'cl_108', '108', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 6732),
  ('f_0006', '20260024', 'fasewonen', 'Tycho Kauffman', 'cl_250', '250', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 6732),
  ('f_0007', '20260022', 'fasehuis', 'Dries Dekker', 'cl_12', '12', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 6732),
  ('f_0008', '20260029', 'Gecombineerd', 'Ricardo Rens', 'cl_267', '267', '1 maart 2026 - 31 maart 2026', '-', 'Gedeclareerd en in behandeling', 17550.05),
  ('f_0009', '1645', 'Gecombineerd', 'Nadia Trela', 'cl_322', '322', '4 november 2025 - 30 november 2025', '10 apr 2026', 'Betaald', 85),
  ('f_0010', '1645', 'Gecombineerd', 'Nadia Trela', 'cl_322', '322', '1 december 2025 - 31 december 2025', '10 apr 2026', 'Betaald', 85),
  ('f_0011', '1641', 'verblijf en behandeling', 'Divano Vrij', 'cl_320', '320', '1 november 2025 - 30 november 2025', '10 apr 2026', 'Betaald', 92.64),
  ('f_0012', '1641', 'verblijf en behandeling', 'Divano Vrij', 'cl_320', '320', '23 oktober 2025 - 31 oktober 2025', '10 apr 2026', 'Betaald', 92.64),
  ('f_0013', '1641', 'verblijf en behandeling', 'Divano Vrij', 'cl_320', '320', '1 december 2025 - 31 december 2025', '10 apr 2026', 'Betaald', 92.64),
  ('f_0014', '1643', 'verblijf vanaf 7 november', 'Nadia Trela', 'cl_322', '322', '1 december 2025 - 31 december 2025', '10 apr 2026', 'Betaald', 11093.04),
  ('f_0015', '1643', 'verblijf vanaf 7 november', 'Nadia Trela', 'cl_322', '322', '4 november 2025 - 30 november 2025', '10 apr 2026', 'Betaald', 9661.68),
  ('f_0016', '20260016', 'Gecombineerd', 'Silas Breederveld', 'cl_228', '228', '1 februari 2026 - 28 februari 2026', '10 apr 2026', 'Betaald', 10698.4),
  ('f_0017', '20260018', 'Gecombineerd', 'Ricardo Rens', 'cl_267', '267', '1 februari 2026 - 28 februari 2026', '10 apr 2026', 'Betaald', 14040.04),
  ('f_0018', '20250006', 'Verblijf en behandeling', 'Tamaika Cooks', 'cl_225', '225', '1 januari 2025 - 31 januari 2025', '19 sep 2025', 'Betaald', 6103.48),
  ('f_0019', '202500139', 'WLZ', 'Destiny Boot', 'cl_318', '318', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 74580.19),
  ('f_0020', '202500146', 'Ambulant', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 4477.8),
  ('f_0021', '202500153', 'Fasewonen', 'Sara Kapli', 'cl_313', '313', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 46215.17),
  ('f_0022', '202500160', 'verblijf', 'Tshayren Landveld', 'cl_315', '315', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 75115.69),
  ('f_0023', '202500167', 'Gecombineerd', 'Nikki Boekel', 'cl_216', '216', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 4083.07),
  ('f_0024', '202500174', 'Verblijf en behandeling', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2025 - 31 oktober 2025', '24 mrt 2025', 'Betaald', 33885.69),
  ('f_0025', '202500181', 'ambulant en verblijf', 'Iris Brouwer', 'cl_311', '311', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 62807.55),
  ('f_0026', '202500188', 'fasewonen', 'Annabel Dikmans', 'cl_90', '90', '1 april 2023 - 30 april 2023', '25 mrt 2025', 'Betaald', 9914.03),
  ('f_0027', '202500195', 'fasehuis', 'Sara Ali', 'cl_209', '209', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 20650.23),
  ('f_0028', '202500202', 'verblijf en behandeling', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 49721.47),
  ('f_0029', '202500209', 'verblijf vanaf 7 november', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 77514.25),
  ('f_0030', '202500216', 'WLZ', 'Storm Kueter', 'cl_297', '297', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 8614.66),
  ('f_0031', '202500223', 'Ambulant', 'Roma Baltus', 'cl_152', '152', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 49298.61),
  ('f_0032', '202500230', 'Fasewonen', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2023 - 31 oktober 2023', '20 mrt 2025', 'Betaald', 78323.29),
  ('f_0033', '202500237', 'verblijf', 'Ricardo Rens', 'cl_267', '267', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 9062.86),
  ('f_0034', '202500244', 'Gecombineerd', 'Donique de Nijs', 'cl_204', '204', '1 april 2021 - 30 april 2021', '5 mrt 2025', 'Betaald', 37778.11),
  ('f_0035', '202500251', 'Verblijf en behandeling', 'Grace de Moor', 'cl_301', '301', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 67605.95),
  ('f_0036', '202500258', 'ambulant en verblijf', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 95843.96),
  ('f_0037', '202500265', 'fasewonen', 'Danique Rietveld', 'cl_309', '309', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 26410.87),
  ('f_0038', '202500272', 'fasehuis', 'Nora Halbesma', 'cl_176', '176', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 53652.69),
  ('f_0039', '202500279', 'verblijf en behandeling', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 83510.6),
  ('f_0040', '202500286', 'verblijf vanaf 7 november', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 12475.07),
  ('f_0041', '202500293', 'WLZ', 'Jason Beltzer', 'cl_21', '21', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 56009.51),
  ('f_0042', '202500300', 'Ambulant', 'Albina Zeneli', 'cl_246', '246', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 83931.64),
  ('f_0043', '202500307', 'Fasewonen', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2021 - 31 juli 2021', '7 mrt 2025', 'Betaald', 13923.34),
  ('f_0044', '202500314', 'verblijf', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 41882.96),
  ('f_0045', '202500321', 'Gecombineerd', 'Jay Stevens', 'cl_171', '171', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 70780.57),
  ('f_0046', '202500328', 'Verblijf en behandeling', 'Danielle Lamping', 'cl_275', '275', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 1615.2),
  ('f_0047', '202500335', 'ambulant en verblijf', 'Eliza Zwart', 'cl_293', '293', '1 juli 2023 - 31 juli 2023', '2 mrt 2025', 'Betaald', 30571.98),
  ('f_0048', '202500342', 'fasewonen', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 59356.1),
  ('f_0049', '202500349', 'fasehuis', 'Cloe Brown', 'cl_165', '165', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 87348.7),
  ('f_0050', '202500356', 'verblijf en behandeling', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 18182.36),
  ('f_0051', '202500363', 'verblijf vanaf 7 november', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 60007.03),
  ('f_0052', '202500370', 'WLZ', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 88875.54),
  ('f_0053', '202500377', 'Ambulant', 'Silas Breederveld', 'cl_228', '228', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 18600.49),
  ('f_0054', '202500384', 'Fasewonen', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 47701.8),
  ('f_0055', '202500391', 'verblijf', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2021 - 31 juli 2021', '7 mrt 2025', 'Betaald', 76546.06),
  ('f_0056', '202500398', 'Gecombineerd', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 22286.74),
  ('f_0057', '202500405', 'Verblijf en behandeling', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2025 - 31 januari 2025', '2 mrt 2025', 'Betaald', 36059.08),
  ('f_0058', '202500412', 'ambulant en verblijf', 'Elin Verburg', 'cl_284', '284', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 64269.93),
  ('f_0059', '202500419', 'fasewonen', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2023 - 31 juli 2023', '11 mrt 2025', 'Betaald', 92209.18),
  ('f_0060', '202500426', 'fasehuis', 'Dries Dekker', 'cl_12', '12', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 18776.7),
  ('f_0061', '202500433', 'verblijf en behandeling', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 64753.05),
  ('f_0062', '202500440', 'verblijf vanaf 7 november', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2023 - 30 april 2023', '9 mrt 2025', 'Betaald', 92809.67),
  ('f_0063', '202500447', 'WLZ', 'Linda Otto', 'cl_196', '196', '1 juli 2025 - 31 juli 2025', '22 mrt 2025', 'Betaald', 22705.34),
  ('f_0064', '202500454', 'Ambulant', 'Nino Joosten', 'cl_197', '197', '1 oktober 2021 - 31 oktober 2021', '14 mrt 2025', 'Betaald', 51604.89),
  ('f_0065', '202500461', 'Fasewonen', 'Raymond Ader', 'cl_184', '184', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 80470.49),
  ('f_0066', '202500468', 'verblijf', 'Ahmet Kat', 'cl_203', '203', '1 april 2025 - 30 april 2025', '24 mrt 2025', 'Betaald', 11059.71),
  ('f_0067', '202500475', 'Gecombineerd', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 40105.73),
  ('f_0068', '202500482', 'Verblijf en behandeling', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2023 - 31 oktober 2023', '25 mrt 2025', 'Betaald', 68948.05),
  ('f_0069', '202500489', 'ambulant en verblijf', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2025 - 31 januari 2025', '11 mrt 2025', 'Betaald', 96823.28),
  ('f_0070', '202500496', 'fasewonen', 'Sayed Danish', 'cl_253', '253', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 27804.38),
  ('f_0071', '202500503', 'fasehuis', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 69457.36),
  ('f_0072', '202500510', 'verblijf en behandeling', 'Mahesh Don', 'cl_237', '237', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 98387.95),
  ('f_0073', '202500517', 'verblijf vanaf 7 november', 'Denisha Wortel', 'cl_178', '178', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 27475.61),
  ('f_0074', '202500524', 'WLZ', 'Shadena Bauman', 'cl_206', '206', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 57093.93),
  ('f_0075', '202500531', 'Ambulant', 'Sara Narouz', 'cl_302', '302', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 86920.8),
  ('f_0076', '202500538', 'Fasewonen', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 63605.7),
  ('f_0077', '202500545', 'verblijf', 'Pelle van Stee', 'cl_278', '278', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 45002.1),
  ('f_0078', '202500552', 'Gecombineerd', 'Joyce Voetel', 'cl_188', '188', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 72998.58),
  ('f_0079', '202500559', 'Verblijf en behandeling', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 3676.07),
  ('f_0080', '202500566', 'ambulant en verblijf', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 32479.59),
  ('f_0081', '202500573', 'fasewonen', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 75275.23),
  ('f_0082', '202500580', 'fasehuis', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 5172.84),
  ('f_0083', '202500587', 'verblijf en behandeling', 'Arsalan Koula', 'cl_337', '337', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 34047.17),
  ('f_0084', '202500594', 'verblijf vanaf 7 november', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2025 - 31 oktober 2025', '19 mrt 2025', 'Betaald', 61977.69),
  ('f_0085', '202500601', 'WLZ', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 91846.27),
  ('f_0086', '202500608', 'Ambulant', 'Jordy Lont', 'cl_326', '326', '1 april 2023 - 30 april 2023', '17 mrt 2025', 'Betaald', 21711.87),
  ('f_0087', '202500615', 'Fasewonen', 'Romano Leone', 'cl_335', '335', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 50639.55),
  ('f_0088', '202500622', 'verblijf', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 79536.19),
  ('f_0089', '202500629', 'Gecombineerd', 'Dylaila Birney', 'cl_327', '327', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 9408.58),
  ('f_0090', '202500636', 'Verblijf en behandeling', 'Maik Meijerink', 'cl_328', '328', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 38308.13),
  ('f_0091', '202500643', 'ambulant en verblijf', 'Dana Ligthart', 'cl_330', '330', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 80071.69),
  ('f_0092', '202500650', 'fasewonen', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 9971.24),
  ('f_0093', '202500657', 'fasehuis', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 38841.69),
  ('f_0094', '202500664', 'verblijf en behandeling', 'Nadia Trela', 'cl_322', '322', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 67739.3),
  ('f_0095', '202500671', 'verblijf vanaf 7 november', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 96636.91),
  ('f_0096', '202500678', 'WLZ', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 26538.4),
  ('f_0097', '202500685', 'Ambulant', 'Divano Vrij', 'cl_320', '320', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 55433.1),
  ('f_0098', '202500692', 'Fasewonen', 'Elona van Milligen', 'cl_319', '319', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 84310.34),
  ('f_0099', '202500699', 'verblijf', 'Destiny Boot', 'cl_318', '318', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 14207.95),
  ('f_0100', '202500706', 'Gecombineerd', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 43105.56),
  ('f_0101', '202500713', 'Verblijf en behandeling', 'Sara Kapli', 'cl_313', '313', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 97727.38),
  ('f_0102', '202500720', 'ambulant en verblijf', 'Tshayren Landveld', 'cl_315', '315', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 68829.48),
  ('f_0103', '202500727', 'fasewonen', 'Nikki Boekel', 'cl_216', '216', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 40864.72),
  ('f_0104', '202500734', 'fasehuis', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 11064.72),
  ('f_0105', '202500741', 'verblijf en behandeling', 'Iris Brouwer', 'cl_311', '311', '1 januari 2025 - 31 januari 2025', '18 mrt 2025', 'Betaald', 81145.48),
  ('f_0106', '202500748', 'verblijf vanaf 7 november', 'Annabel Dikmans', 'cl_90', '90', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 43613.14),
  ('f_0107', '202500755', 'WLZ', 'Sara Ali', 'cl_209', '209', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 24308.04),
  ('f_0108', '202500762', 'Ambulant', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 94239.42),
  ('f_0109', '202500769', 'Fasewonen', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 66449.26),
  ('f_0110', '202500776', 'verblijf', 'Storm Kueter', 'cl_297', '297', '1 april 2023 - 30 april 2023', '20 mrt 2025', 'Betaald', 36351.47),
  ('f_0111', '202500783', 'Gecombineerd', 'Roma Baltus', 'cl_152', '152', '1 juli 2025 - 31 juli 2025', '8 mrt 2025', 'Betaald', 94670.14),
  ('f_0112', '202500790', 'Verblijf en behandeling', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 65648.08),
  ('f_0113', '202500797', 'ambulant en verblijf', 'Ricardo Rens', 'cl_267', '267', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 35911.13),
  ('f_0114', '202500804', 'fasewonen', 'Donique de Nijs', 'cl_204', '204', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 7198.5),
  ('f_0115', '202500811', 'fasehuis', 'Grace de Moor', 'cl_301', '301', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 76373.28),
  ('f_0116', '202500818', 'verblijf en behandeling', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2023 - 31 oktober 2023', '18 mrt 2025', 'Betaald', 48137.89),
  ('f_0117', '202500825', 'verblijf vanaf 7 november', 'Danique Rietveld', 'cl_309', '309', '1 januari 2025 - 31 januari 2025', '13 mrt 2025', 'Betaald', 18573.6),
  ('f_0118', '202500832', 'WLZ', 'Nora Halbesma', 'cl_176', '176', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 90334.4),
  ('f_0119', '202500839', 'Ambulant', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 60479.11),
  ('f_0120', '202500846', 'Fasewonen', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 32517.26),
  ('f_0121', '202500853', 'verblijf', 'Jason Beltzer', 'cl_21', '21', '1 januari 2021 - 31 januari 2021', '9 mrt 2025', 'Betaald', 96556.96),
  ('f_0122', '202500860', 'Gecombineerd', 'Albina Zeneli', 'cl_246', '246', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 60065.93),
  ('f_0123', '202500867', 'Verblijf en behandeling', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 31076.85),
  ('f_0124', '202500874', 'ambulant en verblijf', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2021 - 31 oktober 2021', '2 mrt 2025', 'Betaald', 3119.85),
  ('f_0125', '202500881', 'fasewonen', 'Jay Stevens', 'cl_171', '171', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 73224.86),
  ('f_0126', '202500888', 'fasehuis', 'Danielle Lamping', 'cl_275', '275', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 43392.85),
  ('f_0127', '202500895', 'verblijf en behandeling', 'Eliza Zwart', 'cl_293', '293', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 14438.69),
  ('f_0128', '202500902', 'verblijf vanaf 7 november', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 84657.19),
  ('f_0129', '202500909', 'WLZ', 'Cloe Brown', 'cl_165', '165', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 56667.21),
  ('f_0130', '202500916', 'Ambulant', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 26836.17),
  ('f_0131', '202500923', 'Fasewonen', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 84014.12),
  ('f_0132', '202500930', 'verblijf', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 55148.23),
  ('f_0133', '202500937', 'Gecombineerd', 'Silas Breederveld', 'cl_228', '228', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 26425.9),
  ('f_0134', '202500944', 'Verblijf en behandeling', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 96327.21),
  ('f_0135', '202500951', 'ambulant en verblijf', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 67485.57),
  ('f_0136', '202500958', 'fasewonen', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 31319.03),
  ('f_0137', '202500965', 'fasehuis', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 8977.79),
  ('f_0138', '202500972', 'verblijf en behandeling', 'Elin Verburg', 'cl_284', '284', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 79769.56),
  ('f_0139', '202500979', 'verblijf vanaf 7 november', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 51832.93),
  ('f_0140', '202500986', 'WLZ', 'Dries Dekker', 'cl_12', '12', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 34839.55),
  ('f_0141', '202500993', 'Ambulant', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 79294.3),
  ('f_0142', '202501000', 'Fasewonen', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 51240.3),
  ('f_0143', '202501007', 'verblijf', 'Linda Otto', 'cl_196', '196', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 22347.25),
  ('f_0144', '202501014', 'Gecombineerd', 'Nino Joosten', 'cl_197', '197', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 92450.32),
  ('f_0145', '202501021', 'Verblijf en behandeling', 'Raymond Ader', 'cl_184', '184', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 63587.34),
  ('f_0146', '202501028', 'ambulant en verblijf', 'Ahmet Kat', 'cl_203', '203', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 34000.74),
  ('f_0147', '202501035', 'fasewonen', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2025 - 31 juli 2025', '15 mrt 2025', 'Betaald', 4957.34),
  ('f_0148', '202501042', 'fasehuis', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 75117.64),
  ('f_0149', '202501049', 'verblijf en behandeling', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 47245.03),
  ('f_0150', '202501056', 'verblijf vanaf 7 november', 'Sayed Danish', 'cl_253', '253', '1 april 2025 - 30 april 2025', '14 mrt 2025', 'Betaald', 17266.55),
  ('f_0151', '202501063', 'WLZ', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 74616.19),
  ('f_0152', '202501070', 'Ambulant', 'Mahesh Don', 'cl_237', '237', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 45688.22),
  ('f_0153', '202501077', 'Fasewonen', 'Denisha Wortel', 'cl_178', '178', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 17603.18),
  ('f_0154', '202501084', 'verblijf', 'Shadena Bauman', 'cl_206', '206', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 86987.48),
  ('f_0155', '202501091', 'Gecombineerd', 'Sara Narouz', 'cl_302', '302', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 57163.23),
  ('f_0156', '202501098', 'Verblijf en behandeling', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 89052.47),
  ('f_0157', '202501105', 'ambulant en verblijf', 'Pelle van Stee', 'cl_278', '278', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 99087.17),
  ('f_0158', '202501112', 'fasewonen', 'Joyce Voetel', 'cl_188', '188', '1 april 2023 - 30 april 2023', '13 mrt 2025', 'Betaald', 71093.31),
  ('f_0159', '202501119', 'fasehuis', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 41418.44),
  ('f_0160', '202501126', 'verblijf en behandeling', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 12617.54),
  ('f_0161', '202501133', 'verblijf vanaf 7 november', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2023 - 31 januari 2023', '12 mrt 2025', 'Betaald', 68824.52),
  ('f_0162', '202501140', 'WLZ', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 39929.53),
  ('f_0163', '202501147', 'Ambulant', 'Arsalan Koula', 'cl_337', '337', '1 juli 2021 - 31 juli 2021', '6 mrt 2025', 'Betaald', 11057.82),
  ('f_0164', '202501154', 'Fasewonen', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 82129.92),
  ('f_0165', '202501161', 'verblijf', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2025 - 31 januari 2025', '22 mrt 2025', 'Betaald', 52263.96),
  ('f_0166', '202501168', 'Gecombineerd', 'Jordy Lont', 'cl_326', '326', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 23400.98),
  ('f_0167', '202501175', 'Verblijf en behandeling', 'Romano Leone', 'cl_335', '335', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 93475.92),
  ('f_0168', '202501182', 'ambulant en verblijf', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 64581.9),
  ('f_0169', '202501189', 'fasewonen', 'Dylaila Birney', 'cl_327', '327', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 35712.13),
  ('f_0170', '202501196', 'fasehuis', 'Maik Meijerink', 'cl_328', '328', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 6815.2),
  ('f_0171', '202501203', 'verblijf en behandeling', 'Dana Ligthart', 'cl_330', '330', '1 juli 2025 - 31 juli 2025', '24 mrt 2025', 'Betaald', 64054.26),
  ('f_0172', '202501210', 'verblijf vanaf 7 november', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2021 - 31 oktober 2021', '7 mrt 2025', 'Betaald', 35157.33),
  ('f_0173', '202501217', 'WLZ', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 6289.5),
  ('f_0174', '202501224', 'Ambulant', 'Nadia Trela', 'cl_322', '322', '1 april 2025 - 30 april 2025', '5 mrt 2025', 'Betaald', 76394.51),
  ('f_0175', '202501231', 'Fasewonen', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 47499.52),
  ('f_0176', '202501238', 'verblijf', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2023 - 31 oktober 2023', '21 mrt 2025', 'Betaald', 18600.65),
  ('f_0177', '202501245', 'Gecombineerd', 'Divano Vrij', 'cl_320', '320', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 88708.57),
  ('f_0178', '202501252', 'Verblijf en behandeling', 'Elona van Milligen', 'cl_319', '319', '1 april 2021 - 30 april 2021', '15 mrt 2025', 'Betaald', 59833.95),
  ('f_0179', '202501259', 'ambulant en verblijf', 'Destiny Boot', 'cl_318', '318', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 30938.96),
  ('f_0180', '202501266', 'fasewonen', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2025 - 31 oktober 2025', '10 mrt 2025', 'Betaald', 2043.97),
  ('f_0181', '202501273', 'fasehuis', 'Sara Kapli', 'cl_313', '313', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 59309.22),
  ('f_0182', '202501280', 'verblijf en behandeling', 'Tshayren Landveld', 'cl_315', '315', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 30411.32),
  ('f_0183', '202501287', 'verblijf vanaf 7 november', 'Nikki Boekel', 'cl_216', '216', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 2446.56),
  ('f_0184', '202501294', 'WLZ', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 71646.56),
  ('f_0185', '202501301', 'Ambulant', 'Iris Brouwer', 'cl_311', '311', '1 januari 2023 - 31 januari 2023', '25 mrt 2025', 'Betaald', 42727.32),
  ('f_0186', '202501308', 'Fasewonen', 'Annabel Dikmans', 'cl_90', '90', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 76896.1),
  ('f_0187', '202501315', 'verblijf', 'Sara Ali', 'cl_209', '209', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 84889.88),
  ('f_0188', '202501322', 'Gecombineerd', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 55821.26),
  ('f_0189', '202501329', 'Verblijf en behandeling', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 28031.1),
  ('f_0190', '202501336', 'ambulant en verblijf', 'Storm Kueter', 'cl_297', '297', '1 april 2021 - 30 april 2021', '2 mrt 2025', 'Betaald', 96933.31),
  ('f_0191', '202501343', 'fasewonen', 'Roma Baltus', 'cl_152', '152', '1 juli 2023 - 31 juli 2023', '15 mrt 2025', 'Betaald', 56251.98),
  ('f_0192', '202501350', 'fasehuis', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 27229.92),
  ('f_0193', '202501357', 'verblijf en behandeling', 'Ricardo Rens', 'cl_267', '267', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 96492.97),
  ('f_0194', '202501364', 'verblijf vanaf 7 november', 'Donique de Nijs', 'cl_204', '204', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 67780.34),
  ('f_0195', '202501371', 'WLZ', 'Grace de Moor', 'cl_301', '301', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 37955.12),
  ('f_0196', '202501378', 'Ambulant', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2021 - 31 oktober 2021', '25 mrt 2025', 'Betaald', 9719.73),
  ('f_0197', '202501385', 'Fasewonen', 'Danique Rietveld', 'cl_309', '309', '1 januari 2023 - 31 januari 2023', '20 mrt 2025', 'Betaald', 79155.44),
  ('f_0198', '202501392', 'verblijf', 'Nora Halbesma', 'cl_176', '176', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 51916.24),
  ('f_0199', '202501399', 'Gecombineerd', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 22060.95),
  ('f_0200', '202501406', 'Verblijf en behandeling', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 93099.1),
  ('f_0201', '202501413', 'ambulant en verblijf', 'Jason Beltzer', 'cl_21', '21', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 43682.59),
  ('f_0202', '202501420', 'fasewonen', 'Albina Zeneli', 'cl_246', '246', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 19525),
  ('f_0203', '202501427', 'fasehuis', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 89535.92),
  ('f_0204', '202501434', 'verblijf en behandeling', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 61578.92),
  ('f_0205', '202501441', 'verblijf vanaf 7 november', 'Jay Stevens', 'cl_171', '171', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 32683.93),
  ('f_0206', '202501448', 'WLZ', 'Danielle Lamping', 'cl_275', '275', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 2851.92),
  ('f_0207', '202501455', 'Ambulant', 'Eliza Zwart', 'cl_293', '293', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 72897.76),
  ('f_0208', '202501462', 'Fasewonen', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 44116.26),
  ('f_0209', '202501469', 'verblijf', 'Cloe Brown', 'cl_165', '165', '1 januari 2023 - 31 januari 2023', '16 mrt 2025', 'Betaald', 16126.28),
  ('f_0210', '202501476', 'Gecombineerd', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 85295.24),
  ('f_0211', '202501483', 'Verblijf en behandeling', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 43473.19),
  ('f_0212', '202501490', 'ambulant en verblijf', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 14607.3),
  ('f_0213', '202501497', 'fasewonen', 'Silas Breederveld', 'cl_228', '228', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 84884.97),
  ('f_0214', '202501504', 'fasehuis', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 55786.28),
  ('f_0215', '202501511', 'verblijf en behandeling', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 26944.64),
  ('f_0216', '202501518', 'verblijf vanaf 7 november', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 77444.66),
  ('f_0217', '202501525', 'WLZ', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 67436.86),
  ('f_0218', '202501532', 'Ambulant', 'Elin Verburg', 'cl_284', '284', '1 april 2023 - 30 april 2023', '14 mrt 2025', 'Betaald', 39228.63),
  ('f_0219', '202501539', 'Fasewonen', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 11292),
  ('f_0220', '202501546', 'verblijf', 'Dries Dekker', 'cl_12', '12', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 80965.18),
  ('f_0221', '202501553', 'Gecombineerd', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 38753.37),
  ('f_0222', '202501560', 'Verblijf en behandeling', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 10699.37),
  ('f_0223', '202501567', 'ambulant en verblijf', 'Linda Otto', 'cl_196', '196', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 80806.32),
  ('f_0224', '202501574', 'fasewonen', 'Nino Joosten', 'cl_197', '197', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 51909.39),
  ('f_0225', '202501581', 'fasehuis', 'Raymond Ader', 'cl_184', '184', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 23046.41),
  ('f_0226', '202501588', 'verblijf en behandeling', 'Ahmet Kat', 'cl_203', '203', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 92459.81),
  ('f_0227', '202501595', 'verblijf vanaf 7 november', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 63416.41),
  ('f_0228', '202501602', 'WLZ', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 34576.71),
  ('f_0229', '202501609', 'Ambulant', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 6704.1),
  ('f_0230', '202501616', 'Fasewonen', 'Sayed Danish', 'cl_253', '253', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 75725.62),
  ('f_0231', '202501623', 'verblijf', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2025 - 31 juli 2025', '19 mrt 2025', 'Betaald', 34075.26),
  ('f_0232', '202501630', 'Gecombineerd', 'Mahesh Don', 'cl_237', '237', '1 oktober 2021 - 31 oktober 2021', '20 mrt 2025', 'Betaald', 5147.29),
  ('f_0233', '202501637', 'Verblijf en behandeling', 'Denisha Wortel', 'cl_178', '178', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 76062.25),
  ('f_0234', '202501644', 'ambulant en verblijf', 'Shadena Bauman', 'cl_206', '206', '1 april 2025 - 30 april 2025', '7 mrt 2025', 'Betaald', 46446.55),
  ('f_0235', '202501651', 'fasewonen', 'Sara Narouz', 'cl_302', '302', '1 juli 2021 - 31 juli 2021', '9 mrt 2025', 'Betaald', 16622.3),
  ('f_0236', '202501658', 'fasehuis', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 36178.1),
  ('f_0237', '202501665', 'verblijf en behandeling', 'Pelle van Stee', 'cl_278', '278', '1 januari 2025 - 31 januari 2025', '15 mrt 2025', 'Betaald', 58546.24),
  ('f_0238', '202501672', 'verblijf vanaf 7 november', 'Joyce Voetel', 'cl_188', '188', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 30552.38),
  ('f_0239', '202501679', 'WLZ', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 877.51),
  ('f_0240', '202501686', 'Ambulant', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2025 - 31 oktober 2025', '17 mrt 2025', 'Betaald', 71076.61),
  ('f_0241', '202501693', 'Fasewonen', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 28283.59),
  ('f_0242', '202501700', 'verblijf', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 98388.6),
  ('f_0243', '202501707', 'Gecombineerd', 'Arsalan Koula', 'cl_337', '337', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 69516.89),
  ('f_0244', '202501714', 'Verblijf en behandeling', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 41588.99),
  ('f_0245', '202501721', 'ambulant en verblijf', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 11723.03),
  ('f_0246', '202501728', 'fasewonen', 'Jordy Lont', 'cl_326', '326', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 81860.05),
  ('f_0247', '202501735', 'fasehuis', 'Romano Leone', 'cl_335', '335', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 52934.99),
  ('f_0248', '202501742', 'verblijf en behandeling', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2023 - 31 oktober 2023', '21 mrt 2025', 'Betaald', 24040.97),
  ('f_0249', '202501749', 'verblijf vanaf 7 november', 'Dylaila Birney', 'cl_327', '327', '1 januari 2025 - 31 januari 2025', '7 mrt 2025', 'Betaald', 94171.2),
  ('f_0250', '202501756', 'WLZ', 'Maik Meijerink', 'cl_328', '328', '1 april 2021 - 30 april 2021', '15 mrt 2025', 'Betaald', 65274.27),
  ('f_0251', '202501763', 'Ambulant', 'Dana Ligthart', 'cl_330', '330', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 23513.33),
  ('f_0252', '202501770', 'Fasewonen', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 93616.4),
  ('f_0253', '202501777', 'verblijf', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 64748.57),
  ('f_0254', '202501784', 'Gecombineerd', 'Nadia Trela', 'cl_322', '322', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 35853.58),
  ('f_0255', '202501791', 'Verblijf en behandeling', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 6958.59),
  ('f_0256', '202501798', 'ambulant en verblijf', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 77059.72),
  ('f_0257', '202501805', 'fasewonen', 'Divano Vrij', 'cl_320', '320', '1 januari 2023 - 31 januari 2023', '25 mrt 2025', 'Betaald', 48167.64),
  ('f_0258', '202501812', 'fasehuis', 'Elona van Milligen', 'cl_319', '319', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 19293.02),
  ('f_0259', '202501819', 'verblijf en behandeling', 'Destiny Boot', 'cl_318', '318', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 89398.03),
  ('f_0260', '202501826', 'verblijf vanaf 7 november', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 60503.04),
  ('f_0261', '202501833', 'WLZ', 'Sara Kapli', 'cl_313', '313', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 18768.29),
  ('f_0262', '202501840', 'Ambulant', 'Tshayren Landveld', 'cl_315', '315', '1 april 2021 - 30 april 2021', '10 mrt 2025', 'Betaald', 88870.39),
  ('f_0263', '202501847', 'Fasewonen', 'Nikki Boekel', 'cl_216', '216', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 60905.63),
  ('f_0264', '202501854', 'verblijf', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 31105.63),
  ('f_0265', '202501861', 'Gecombineerd', 'Iris Brouwer', 'cl_311', '311', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 2186.39),
  ('f_0266', '202501868', 'Verblijf en behandeling', 'Annabel Dikmans', 'cl_90', '90', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 24021.73),
  ('f_0267', '202501875', 'ambulant en verblijf', 'Sara Ali', 'cl_209', '209', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 44348.95),
  ('f_0268', '202501882', 'fasewonen', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2021 - 31 oktober 2021', '24 mrt 2025', 'Betaald', 15280.33),
  ('f_0269', '202501889', 'fasehuis', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 86490.17),
  ('f_0270', '202501896', 'verblijf en behandeling', 'Storm Kueter', 'cl_297', '297', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 56392.38),
  ('f_0271', '202501903', 'verblijf vanaf 7 november', 'Roma Baltus', 'cl_152', '152', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 15711.05),
  ('f_0272', '202501910', 'WLZ', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 85688.99),
  ('f_0273', '202501917', 'Ambulant', 'Ricardo Rens', 'cl_267', '267', '1 januari 2025 - 31 januari 2025', '2 mrt 2025', 'Betaald', 55952.04),
  ('f_0274', '202501924', 'Fasewonen', 'Donique de Nijs', 'cl_204', '204', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 27239.41),
  ('f_0275', '202501931', 'verblijf', 'Grace de Moor', 'cl_301', '301', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 96414.19),
  ('f_0276', '202501938', 'Gecombineerd', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 68178.8),
  ('f_0277', '202501945', 'Verblijf en behandeling', 'Danique Rietveld', 'cl_309', '309', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 38614.51),
  ('f_0278', '202501952', 'ambulant en verblijf', 'Nora Halbesma', 'cl_176', '176', '1 april 2023 - 30 april 2023', '3 mrt 2025', 'Betaald', 11375.31),
  ('f_0279', '202501959', 'fasewonen', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2025 - 31 juli 2025', '23 mrt 2025', 'Betaald', 80520.02),
  ('f_0280', '202501966', 'fasehuis', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2021 - 31 oktober 2021', '20 mrt 2025', 'Betaald', 52558.17),
  ('f_0281', '202501973', 'verblijf en behandeling', 'Jason Beltzer', 'cl_21', '21', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 76965.55),
  ('f_0282', '202501980', 'verblijf vanaf 7 november', 'Albina Zeneli', 'cl_246', '246', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 80106.84),
  ('f_0283', '202501987', 'WLZ', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 51117.76),
  ('f_0284', '202501994', 'Ambulant', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 23160.76),
  ('f_0285', '202502001', 'Fasewonen', 'Jay Stevens', 'cl_171', '171', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 93265.77),
  ('f_0286', '202502008', 'verblijf', 'Danielle Lamping', 'cl_275', '275', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 63433.76),
  ('f_0287', '202502015', 'Gecombineerd', 'Eliza Zwart', 'cl_293', '293', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 34479.6),
  ('f_0288', '202502022', 'Verblijf en behandeling', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 5698.1),
  ('f_0289', '202502029', 'ambulant en verblijf', 'Cloe Brown', 'cl_165', '165', '1 januari 2021 - 31 januari 2021', '23 mrt 2025', 'Betaald', 76708.12),
  ('f_0290', '202502036', 'fasewonen', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 46877.08),
  ('f_0291', '202502043', 'fasehuis', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 5055.03),
  ('f_0292', '202502050', 'verblijf en behandeling', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 75189.14),
  ('f_0293', '202502057', 'verblijf vanaf 7 november', 'Silas Breederveld', 'cl_228', '228', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 46466.81),
  ('f_0294', '202502064', 'WLZ', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 17368.12),
  ('f_0295', '202502071', 'Ambulant', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 87526.48),
  ('f_0296', '202502078', 'Fasewonen', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 11727.62),
  ('f_0297', '202502085', 'verblijf', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 29018.7),
  ('f_0298', '202502092', 'Gecombineerd', 'Elin Verburg', 'cl_284', '284', '1 april 2021 - 30 april 2021', '21 mrt 2025', 'Betaald', 810.47),
  ('f_0299', '202502099', 'Verblijf en behandeling', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 71873.84),
  ('f_0300', '202502106', 'ambulant en verblijf', 'Dries Dekker', 'cl_12', '12', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 15248.14),
  ('f_0301', '202502113', 'fasewonen', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2021 - 31 januari 2021', '3 mrt 2025', 'Betaald', 97212.44),
  ('f_0302', '202502120', 'fasehuis', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 69158.44),
  ('f_0303', '202502127', 'verblijf en behandeling', 'Linda Otto', 'cl_196', '196', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 40265.39),
  ('f_0304', '202502134', 'verblijf vanaf 7 november', 'Nino Joosten', 'cl_197', '197', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 11368.46),
  ('f_0305', '202502141', 'WLZ', 'Raymond Ader', 'cl_184', '184', '1 januari 2023 - 31 januari 2023', '18 mrt 2025', 'Betaald', 81505.48),
  ('f_0306', '202502148', 'Ambulant', 'Ahmet Kat', 'cl_203', '203', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 51918.88),
  ('f_0307', '202502155', 'Fasewonen', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 22875.48),
  ('f_0308', '202502162', 'verblijf', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 93035.78),
  ('f_0309', '202502169', 'Gecombineerd', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 65163.17),
  ('f_0310', '202502176', 'Verblijf en behandeling', 'Sayed Danish', 'cl_253', '253', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 35184.69),
  ('f_0311', '202502183', 'ambulant en verblijf', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 92534.33),
  ('f_0312', '202502190', 'fasewonen', 'Mahesh Don', 'cl_237', '237', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 63606.36),
  ('f_0313', '202502197', 'fasehuis', 'Denisha Wortel', 'cl_178', '178', '1 januari 2021 - 31 januari 2021', '6 mrt 2025', 'Betaald', 35521.32),
  ('f_0314', '202502204', 'verblijf en behandeling', 'Shadena Bauman', 'cl_206', '206', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 5905.62),
  ('f_0315', '202502211', 'verblijf vanaf 7 november', 'Sara Narouz', 'cl_302', '302', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 75081.37),
  ('f_0316', '202502218', 'WLZ', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2021 - 31 oktober 2021', '15 mrt 2025', 'Betaald', 82303.73),
  ('f_0317', '202502225', 'Ambulant', 'Pelle van Stee', 'cl_278', '278', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 18005.31),
  ('f_0318', '202502232', 'Fasewonen', 'Joyce Voetel', 'cl_188', '188', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 89011.45),
  ('f_0319', '202502239', 'verblijf', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2021 - 31 juli 2021', '1 mrt 2025', 'Betaald', 59336.58),
  ('f_0320', '202502246', 'Gecombineerd', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 30535.68),
  ('f_0321', '202502253', 'Verblijf en behandeling', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 86742.66),
  ('f_0322', '202502260', 'ambulant en verblijf', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2021 - 30 april 2021', '4 mrt 2025', 'Betaald', 57847.67),
  ('f_0323', '202502267', 'fasewonen', 'Arsalan Koula', 'cl_337', '337', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 28975.96),
  ('f_0324', '202502274', 'fasehuis', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 1048.06),
  ('f_0325', '202502281', 'verblijf en behandeling', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 70182.1),
  ('f_0326', '202502288', 'verblijf vanaf 7 november', 'Jordy Lont', 'cl_326', '326', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 41319.12),
  ('f_0327', '202502295', 'WLZ', 'Romano Leone', 'cl_335', '335', '1 juli 2025 - 31 juli 2025', '1 mrt 2025', 'Betaald', 12394.06),
  ('f_0328', '202502302', 'Ambulant', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 82500.04),
  ('f_0329', '202502309', 'Fasewonen', 'Dylaila Birney', 'cl_327', '327', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 53630.27),
  ('f_0330', '202502316', 'verblijf', 'Maik Meijerink', 'cl_328', '328', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 24733.34),
  ('f_0331', '202502323', 'Gecombineerd', 'Dana Ligthart', 'cl_330', '330', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 81972.4),
  ('f_0332', '202502330', 'Verblijf en behandeling', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 53075.47),
  ('f_0333', '202502337', 'ambulant en verblijf', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2025 - 31 januari 2025', '2 mrt 2025', 'Betaald', 24207.64),
  ('f_0334', '202502344', 'fasewonen', 'Nadia Trela', 'cl_322', '322', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 94312.65),
  ('f_0335', '202502351', 'fasehuis', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2023 - 31 juli 2023', '22 mrt 2025', 'Betaald', 65417.66),
  ('f_0336', '202502358', 'verblijf en behandeling', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 36518.79),
  ('f_0337', '202502365', 'verblijf vanaf 7 november', 'Divano Vrij', 'cl_320', '320', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 7626.71),
  ('f_0338', '202502372', 'WLZ', 'Elona van Milligen', 'cl_319', '319', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 77752.09),
  ('f_0339', '202502379', 'Ambulant', 'Destiny Boot', 'cl_318', '318', '1 juli 2025 - 31 juli 2025', '7 mrt 2025', 'Betaald', 48857.1),
  ('f_0340', '202502386', 'Fasewonen', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 19962.11),
  ('f_0341', '202502393', 'verblijf', 'Sara Kapli', 'cl_313', '313', '1 januari 2023 - 31 januari 2023', '19 mrt 2025', 'Betaald', 77227.36),
  ('f_0342', '202502400', 'Gecombineerd', 'Tshayren Landveld', 'cl_315', '315', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 48329.46),
  ('f_0343', '202502407', 'Verblijf en behandeling', 'Nikki Boekel', 'cl_216', '216', '1 juli 2021 - 31 juli 2021', '20 mrt 2025', 'Betaald', 20364.7),
  ('f_0344', '202502414', 'ambulant en verblijf', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 89564.7),
  ('f_0345', '202502421', 'fasewonen', 'Iris Brouwer', 'cl_311', '311', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 60645.46),
  ('f_0346', '202502428', 'fasehuis', 'Annabel Dikmans', 'cl_90', '90', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 70147.36),
  ('f_0347', '202502435', 'verblijf en behandeling', 'Sara Ali', 'cl_209', '209', '1 juli 2023 - 31 juli 2023', '9 mrt 2025', 'Betaald', 3808.02),
  ('f_0348', '202502442', 'verblijf vanaf 7 november', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 73739.4),
  ('f_0349', '202502449', 'WLZ', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2021 - 31 januari 2021', '14 mrt 2025', 'Betaald', 45949.24),
  ('f_0350', '202502456', 'Ambulant', 'Storm Kueter', 'cl_297', '297', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 15851.45),
  ('f_0351', '202502463', 'Fasewonen', 'Roma Baltus', 'cl_152', '152', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 74170.12),
  ('f_0352', '202502470', 'verblijf', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 45148.06),
  ('f_0353', '202502477', 'Gecombineerd', 'Ricardo Rens', 'cl_267', '267', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 15411.11),
  ('f_0354', '202502484', 'Verblijf en behandeling', 'Donique de Nijs', 'cl_204', '204', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 85698.48),
  ('f_0355', '202502491', 'ambulant en verblijf', 'Grace de Moor', 'cl_301', '301', '1 juli 2021 - 31 juli 2021', '17 mrt 2025', 'Betaald', 55873.26),
  ('f_0356', '202502498', 'fasewonen', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 27637.87),
  ('f_0357', '202502505', 'fasehuis', 'Danique Rietveld', 'cl_309', '309', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 97073.58),
  ('f_0358', '202502512', 'verblijf en behandeling', 'Nora Halbesma', 'cl_176', '176', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 69834.38),
  ('f_0359', '202502519', 'verblijf vanaf 7 november', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 39979.09),
  ('f_0360', '202502526', 'WLZ', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 12017.24),
  ('f_0361', '202502533', 'Ambulant', 'Jason Beltzer', 'cl_21', '21', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 24091.18),
  ('f_0362', '202502540', 'Fasewonen', 'Albina Zeneli', 'cl_246', '246', '1 april 2023 - 30 april 2023', '1 mrt 2025', 'Betaald', 39565.91),
  ('f_0363', '202502547', 'verblijf', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 10576.83),
  ('f_0364', '202502554', 'Gecombineerd', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 81619.83),
  ('f_0365', '202502561', 'Verblijf en behandeling', 'Jay Stevens', 'cl_171', '171', '1 januari 2023 - 31 januari 2023', '1 mrt 2025', 'Betaald', 52724.84),
  ('f_0366', '202502568', 'ambulant en verblijf', 'Danielle Lamping', 'cl_275', '275', '1 april 2025 - 30 april 2025', '20 mrt 2025', 'Betaald', 22892.83),
  ('f_0367', '202502575', 'fasewonen', 'Eliza Zwart', 'cl_293', '293', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 92938.67),
  ('f_0368', '202502582', 'fasehuis', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2023 - 31 oktober 2023', '21 mrt 2025', 'Betaald', 64157.17),
  ('f_0369', '202502589', 'verblijf en behandeling', 'Cloe Brown', 'cl_165', '165', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 36167.19),
  ('f_0370', '202502596', 'verblijf vanaf 7 november', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2021 - 30 april 2021', '9 mrt 2025', 'Betaald', 6336.15),
  ('f_0371', '202502603', 'WLZ', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2023 - 31 juli 2023', '21 mrt 2025', 'Betaald', 63514.1),
  ('f_0372', '202502610', 'Ambulant', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2025 - 31 oktober 2025', '11 mrt 2025', 'Betaald', 34648.21),
  ('f_0373', '202502617', 'Fasewonen', 'Silas Breederveld', 'cl_228', '228', '1 januari 2021 - 31 januari 2021', '24 mrt 2025', 'Betaald', 5925.88),
  ('f_0374', '202502624', 'verblijf', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2023 - 30 april 2023', '24 mrt 2025', 'Betaald', 75827.19),
  ('f_0375', '202502631', 'Gecombineerd', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 46985.55),
  ('f_0376', '202502638', 'Verblijf en behandeling', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2021 - 31 oktober 2021', '1 mrt 2025', 'Betaald', 57853.25),
  ('f_0377', '202502645', 'ambulant en verblijf', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 87477.77),
  ('f_0378', '202502652', 'fasewonen', 'Elin Verburg', 'cl_284', '284', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 59269.54),
  ('f_0379', '202502659', 'fasehuis', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 31332.91),
  ('f_0380', '202502666', 'verblijf en behandeling', 'Dries Dekker', 'cl_12', '12', '1 oktober 2023 - 31 oktober 2023', '25 mrt 2025', 'Betaald', 61373.77),
  ('f_0381', '202502673', 'verblijf vanaf 7 november', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2025 - 31 januari 2025', '10 mrt 2025', 'Betaald', 58794.28),
  ('f_0382', '202502680', 'WLZ', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 30740.28),
  ('f_0383', '202502687', 'Ambulant', 'Linda Otto', 'cl_196', '196', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 1847.23),
  ('f_0384', '202502694', 'Fasewonen', 'Nino Joosten', 'cl_197', '197', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 71950.3),
  ('f_0385', '202502701', 'verblijf', 'Raymond Ader', 'cl_184', '184', '1 januari 2021 - 31 januari 2021', '25 mrt 2025', 'Betaald', 43087.32),
  ('f_0386', '202502708', 'Gecombineerd', 'Ahmet Kat', 'cl_203', '203', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 13500.72),
  ('f_0387', '202502715', 'Verblijf en behandeling', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 83457.32),
  ('f_0388', '202502722', 'ambulant en verblijf', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 54617.62),
  ('f_0389', '202502729', 'fasewonen', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 26745.01),
  ('f_0390', '202502736', 'fasehuis', 'Sayed Danish', 'cl_253', '253', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 95766.53),
  ('f_0391', '202502743', 'verblijf en behandeling', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 54116.17),
  ('f_0392', '202502750', 'verblijf vanaf 7 november', 'Mahesh Don', 'cl_237', '237', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 25188.2),
  ('f_0393', '202502757', 'WLZ', 'Denisha Wortel', 'cl_178', '178', '1 januari 2025 - 31 januari 2025', '13 mrt 2025', 'Betaald', 96103.16),
  ('f_0394', '202502764', 'Ambulant', 'Shadena Bauman', 'cl_206', '206', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 66487.46),
  ('f_0395', '202502771', 'Fasewonen', 'Sara Narouz', 'cl_302', '302', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 36663.21),
  ('f_0396', '202502778', 'verblijf', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2025 - 31 oktober 2025', '18 mrt 2025', 'Betaald', 16586.69),
  ('f_0397', '202502785', 'Gecombineerd', 'Pelle van Stee', 'cl_278', '278', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 78587.15),
  ('f_0398', '202502792', 'Verblijf en behandeling', 'Joyce Voetel', 'cl_188', '188', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 50593.29),
  ('f_0399', '202502799', 'ambulant en verblijf', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2025 - 31 juli 2025', '8 mrt 2025', 'Betaald', 20918.42),
  ('f_0400', '202502806', 'fasewonen', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 91117.52),
  ('f_0401', '202502813', 'fasehuis', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 46201.73),
  ('f_0402', '202502820', 'verblijf en behandeling', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 17306.74),
  ('f_0403', '202502827', 'verblijf vanaf 7 november', 'Arsalan Koula', 'cl_337', '337', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 87435.03),
  ('f_0404', '202502834', 'WLZ', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2023 - 31 oktober 2023', '11 mrt 2025', 'Betaald', 59507.13),
  ('f_0405', '202502841', 'Ambulant', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 29641.17),
  ('f_0406', '202502848', 'Fasewonen', 'Jordy Lont', 'cl_326', '326', '1 april 2021 - 30 april 2021', '13 mrt 2025', 'Betaald', 778.19),
  ('f_0407', '202502855', 'verblijf', 'Romano Leone', 'cl_335', '335', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 70853.13),
  ('f_0408', '202502862', 'Gecombineerd', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 41959.11),
  ('f_0409', '202502869', 'Verblijf en behandeling', 'Dylaila Birney', 'cl_327', '327', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 13089.34),
  ('f_0410', '202502876', 'ambulant en verblijf', 'Maik Meijerink', 'cl_328', '328', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 83192.41),
  ('f_0411', '202502883', 'fasewonen', 'Dana Ligthart', 'cl_330', '330', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 41431.47),
  ('f_0412', '202502890', 'fasehuis', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 12534.54),
  ('f_0413', '202502897', 'verblijf en behandeling', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 82666.71),
  ('f_0414', '202502904', 'verblijf vanaf 7 november', 'Nadia Trela', 'cl_322', '322', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 53771.72),
  ('f_0415', '202502911', 'WLZ', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 24876.73),
  ('f_0416', '202502918', 'Ambulant', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 94977.86),
  ('f_0417', '202502925', 'Fasewonen', 'Divano Vrij', 'cl_320', '320', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 66085.78),
  ('f_0418', '202502932', 'verblijf', 'Elona van Milligen', 'cl_319', '319', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 37211.16),
  ('f_0419', '202502939', 'Gecombineerd', 'Destiny Boot', 'cl_318', '318', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 8316.17),
  ('f_0420', '202502946', 'Verblijf en behandeling', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 78421.18),
  ('f_0421', '202502953', 'ambulant en verblijf', 'Sara Kapli', 'cl_313', '313', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 36686.43),
  ('f_0422', '202502960', 'fasewonen', 'Tshayren Landveld', 'cl_315', '315', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 7788.53),
  ('f_0423', '202502967', 'fasehuis', 'Nikki Boekel', 'cl_216', '216', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 78823.77),
  ('f_0424', '202502974', 'verblijf en behandeling', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2021 - 31 oktober 2021', '13 mrt 2025', 'Betaald', 49023.77),
  ('f_0425', '202502981', 'verblijf vanaf 7 november', 'Iris Brouwer', 'cl_311', '311', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 20104.53),
  ('f_0426', '202502988', 'WLZ', 'Annabel Dikmans', 'cl_90', '90', '1 april 2025 - 30 april 2025', '18 mrt 2025', 'Betaald', 17272.99),
  ('f_0427', '202502995', 'Ambulant', 'Sara Ali', 'cl_209', '209', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 62267.09),
  ('f_0428', '202503002', 'Fasewonen', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 33198.47),
  ('f_0429', '202503009', 'verblijf', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 5408.31),
  ('f_0430', '202503016', 'Gecombineerd', 'Storm Kueter', 'cl_297', '297', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 74310.52),
  ('f_0431', '202503023', 'Verblijf en behandeling', 'Roma Baltus', 'cl_152', '152', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 33629.19),
  ('f_0432', '202503030', 'ambulant en verblijf', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2025 - 31 oktober 2025', '17 mrt 2025', 'Betaald', 4607.13),
  ('f_0433', '202503037', 'fasewonen', 'Ricardo Rens', 'cl_267', '267', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 73870.18),
  ('f_0434', '202503044', 'fasehuis', 'Donique de Nijs', 'cl_204', '204', '1 april 2023 - 30 april 2023', '7 mrt 2025', 'Betaald', 45157.55),
  ('f_0435', '202503051', 'verblijf en behandeling', 'Grace de Moor', 'cl_301', '301', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 15332.33),
  ('f_0436', '202503058', 'verblijf vanaf 7 november', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 86096.94),
  ('f_0437', '202503065', 'WLZ', 'Danique Rietveld', 'cl_309', '309', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 56532.65),
  ('f_0438', '202503072', 'Ambulant', 'Nora Halbesma', 'cl_176', '176', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 29293.45),
  ('f_0439', '202503079', 'Fasewonen', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 98438.16),
  ('f_0440', '202503086', 'verblijf', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 70476.31),
  ('f_0441', '202503093', 'Gecombineerd', 'Jason Beltzer', 'cl_21', '21', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 70216.81),
  ('f_0442', '202503100', 'Verblijf en behandeling', 'Albina Zeneli', 'cl_246', '246', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 98024.98),
  ('f_0443', '202503107', 'ambulant en verblijf', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2023 - 31 juli 2023', '5 mrt 2025', 'Betaald', 69035.9),
  ('f_0444', '202503114', 'fasewonen', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 41078.9),
  ('f_0445', '202503121', 'fasehuis', 'Jay Stevens', 'cl_171', '171', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 12183.91),
  ('f_0446', '202503128', 'verblijf en behandeling', 'Danielle Lamping', 'cl_275', '275', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 81351.9),
  ('f_0447', '202503135', 'verblijf vanaf 7 november', 'Eliza Zwart', 'cl_293', '293', '1 juli 2025 - 31 juli 2025', '10 mrt 2025', 'Betaald', 52397.74),
  ('f_0448', '202503142', 'WLZ', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 23616.24),
  ('f_0449', '202503149', 'Ambulant', 'Cloe Brown', 'cl_165', '165', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 94626.26),
  ('f_0450', '202503156', 'Fasewonen', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 64795.22),
  ('f_0451', '202503163', 'verblijf', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 22973.17),
  ('f_0452', '202503170', 'Gecombineerd', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 93107.28),
  ('f_0453', '202503177', 'Verblijf en behandeling', 'Silas Breederveld', 'cl_228', '228', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 64384.95),
  ('f_0454', '202503184', 'ambulant en verblijf', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 35286.26),
  ('f_0455', '202503191', 'fasewonen', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2023 - 31 juli 2023', '5 mrt 2025', 'Betaald', 6444.62),
  ('f_0456', '202503198', 'fasehuis', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 4978.88),
  ('f_0457', '202503205', 'verblijf en behandeling', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2021 - 31 januari 2021', '10 mrt 2025', 'Betaald', 46936.84),
  ('f_0458', '202503212', 'verblijf vanaf 7 november', 'Elin Verburg', 'cl_284', '284', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 18728.61),
  ('f_0459', '202503219', 'WLZ', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2025 - 31 juli 2025', '1 mrt 2025', 'Betaald', 89791.98),
  ('f_0460', '202503226', 'Ambulant', 'Dries Dekker', 'cl_12', '12', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 8499.4),
  ('f_0461', '202503233', 'Fasewonen', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 18253.35),
  ('f_0462', '202503240', 'verblijf', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2025 - 30 april 2025', '3 mrt 2025', 'Betaald', 89199.35),
  ('f_0463', '202503247', 'Gecombineerd', 'Linda Otto', 'cl_196', '196', '1 juli 2021 - 31 juli 2021', '15 mrt 2025', 'Betaald', 60306.3),
  ('f_0464', '202503254', 'Verblijf en behandeling', 'Nino Joosten', 'cl_197', '197', '1 oktober 2023 - 31 oktober 2023', '23 mrt 2025', 'Betaald', 31409.37),
  ('f_0465', '202503261', 'ambulant en verblijf', 'Raymond Ader', 'cl_184', '184', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 2546.39),
  ('f_0466', '202503268', 'fasewonen', 'Ahmet Kat', 'cl_203', '203', '1 april 2021 - 30 april 2021', '13 mrt 2025', 'Betaald', 71959.79),
  ('f_0467', '202503275', 'fasehuis', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 42916.39),
  ('f_0468', '202503282', 'verblijf en behandeling', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2025 - 31 oktober 2025', '12 mrt 2025', 'Betaald', 14076.69),
  ('f_0469', '202503289', 'verblijf vanaf 7 november', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2021 - 31 januari 2021', '1 mrt 2025', 'Betaald', 85204.08),
  ('f_0470', '202503296', 'WLZ', 'Sayed Danish', 'cl_253', '253', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 55225.6),
  ('f_0471', '202503303', 'Ambulant', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 13575.24),
  ('f_0472', '202503310', 'Fasewonen', 'Mahesh Don', 'cl_237', '237', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 83647.27),
  ('f_0473', '202503317', 'verblijf', 'Denisha Wortel', 'cl_178', '178', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 55562.23),
  ('f_0474', '202503324', 'Gecombineerd', 'Shadena Bauman', 'cl_206', '206', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 25946.53),
  ('f_0475', '202503331', 'Verblijf en behandeling', 'Sara Narouz', 'cl_302', '302', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 95122.28),
  ('f_0476', '202503338', 'ambulant en verblijf', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 62712.32),
  ('f_0477', '202503345', 'fasewonen', 'Pelle van Stee', 'cl_278', '278', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 38046.22),
  ('f_0478', '202503352', 'fasehuis', 'Joyce Voetel', 'cl_188', '188', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 10052.36),
  ('f_0479', '202503359', 'verblijf en behandeling', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 79377.49),
  ('f_0480', '202503366', 'verblijf vanaf 7 november', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 50576.59),
  ('f_0481', '202503373', 'WLZ', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 7783.57),
  ('f_0482', '202503380', 'Ambulant', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 77888.58),
  ('f_0483', '202503387', 'Fasewonen', 'Arsalan Koula', 'cl_337', '337', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 49016.87),
  ('f_0484', '202503394', 'verblijf', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2021 - 31 oktober 2021', '18 mrt 2025', 'Betaald', 21088.97),
  ('f_0485', '202503401', 'Gecombineerd', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 90223.01),
  ('f_0486', '202503408', 'Verblijf en behandeling', 'Jordy Lont', 'cl_326', '326', '1 april 2025 - 30 april 2025', '20 mrt 2025', 'Betaald', 61360.03),
  ('f_0487', '202503415', 'ambulant en verblijf', 'Romano Leone', 'cl_335', '335', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 32434.97),
  ('f_0488', '202503422', 'fasewonen', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 3540.95),
  ('f_0489', '202503429', 'fasehuis', 'Dylaila Birney', 'cl_327', '327', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 73671.18),
  ('f_0490', '202503436', 'verblijf en behandeling', 'Maik Meijerink', 'cl_328', '328', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 44774.25),
  ('f_0491', '202503443', 'verblijf vanaf 7 november', 'Dana Ligthart', 'cl_330', '330', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 3013.31),
  ('f_0492', '202503450', 'WLZ', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 73116.38),
  ('f_0493', '202503457', 'Ambulant', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 44248.55),
  ('f_0494', '202503464', 'Fasewonen', 'Nadia Trela', 'cl_322', '322', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 15353.56),
  ('f_0495', '202503471', 'verblijf', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 85458.57),
  ('f_0496', '202503478', 'Gecombineerd', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 56559.7),
  ('f_0497', '202503485', 'Verblijf en behandeling', 'Divano Vrij', 'cl_320', '320', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 27667.62),
  ('f_0498', '202503492', 'ambulant en verblijf', 'Elona van Milligen', 'cl_319', '319', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 97793),
  ('f_0499', '202503499', 'fasewonen', 'Destiny Boot', 'cl_318', '318', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 68898.01),
  ('f_0500', '202503506', 'fasehuis', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 40003.02),
  ('f_0501', '202503513', 'verblijf en behandeling', 'Sara Kapli', 'cl_313', '313', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 95145.5),
  ('f_0502', '202503520', 'verblijf vanaf 7 november', 'Tshayren Landveld', 'cl_315', '315', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 66247.6),
  ('f_0503', '202503527', 'WLZ', 'Nikki Boekel', 'cl_216', '216', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 38282.84),
  ('f_0504', '202503534', 'Ambulant', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 8482.84),
  ('f_0505', '202503541', 'Fasewonen', 'Iris Brouwer', 'cl_311', '311', '1 januari 2021 - 31 januari 2021', '14 mrt 2025', 'Betaald', 78563.6),
  ('f_0506', '202503548', 'verblijf', 'Annabel Dikmans', 'cl_90', '90', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 63398.62),
  ('f_0507', '202503555', 'Gecombineerd', 'Sara Ali', 'cl_209', '209', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 21726.16),
  ('f_0508', '202503562', 'Verblijf en behandeling', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 91657.54),
  ('f_0509', '202503569', 'ambulant en verblijf', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 63867.38),
  ('f_0510', '202503576', 'fasewonen', 'Storm Kueter', 'cl_297', '297', '1 april 2025 - 30 april 2025', '16 mrt 2025', 'Betaald', 33769.59),
  ('f_0511', '202503583', 'fasehuis', 'Roma Baltus', 'cl_152', '152', '1 juli 2021 - 31 juli 2021', '4 mrt 2025', 'Betaald', 92088.26),
  ('f_0512', '202503590', 'verblijf en behandeling', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 63066.2),
  ('f_0513', '202503597', 'verblijf vanaf 7 november', 'Ricardo Rens', 'cl_267', '267', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 33329.25),
  ('f_0514', '202503604', 'WLZ', 'Donique de Nijs', 'cl_204', '204', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 4616.62),
  ('f_0515', '202503611', 'Ambulant', 'Grace de Moor', 'cl_301', '301', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 73791.4),
  ('f_0516', '202503618', 'Fasewonen', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2025 - 31 oktober 2025', '14 mrt 2025', 'Betaald', 45556.01),
  ('f_0517', '202503625', 'verblijf', 'Danique Rietveld', 'cl_309', '309', '1 januari 2021 - 31 januari 2021', '9 mrt 2025', 'Betaald', 15991.72),
  ('f_0518', '202503632', 'Gecombineerd', 'Nora Halbesma', 'cl_176', '176', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 87752.52),
  ('f_0519', '202503639', 'Verblijf en behandeling', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 57897.23),
  ('f_0520', '202503646', 'ambulant en verblijf', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 29935.38),
  ('f_0521', '202503653', 'fasewonen', 'Jason Beltzer', 'cl_21', '21', '1 januari 2023 - 31 januari 2023', '18 mrt 2025', 'Betaald', 17342.44),
  ('f_0522', '202503660', 'fasehuis', 'Albina Zeneli', 'cl_246', '246', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 57484.05),
  ('f_0523', '202503667', 'verblijf en behandeling', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 28494.97),
  ('f_0524', '202503674', 'verblijf vanaf 7 november', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2023 - 31 oktober 2023', '23 mrt 2025', 'Betaald', 537.97),
  ('f_0525', '202503681', 'WLZ', 'Jay Stevens', 'cl_171', '171', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 70642.98),
  ('f_0526', '202503688', 'Ambulant', 'Danielle Lamping', 'cl_275', '275', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 40810.97),
  ('f_0527', '202503695', 'Fasewonen', 'Eliza Zwart', 'cl_293', '293', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 11856.81),
  ('f_0528', '202503702', 'verblijf', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 82075.31),
  ('f_0529', '202503709', 'Gecombineerd', 'Cloe Brown', 'cl_165', '165', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 54085.33),
  ('f_0530', '202503716', 'Verblijf en behandeling', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 24254.29),
  ('f_0531', '202503723', 'ambulant en verblijf', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 81432.24),
  ('f_0532', '202503730', 'fasewonen', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 52566.35),
  ('f_0533', '202503737', 'fasehuis', 'Silas Breederveld', 'cl_228', '228', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 23844.02),
  ('f_0534', '202503744', 'verblijf en behandeling', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 93745.33),
  ('f_0535', '202503751', 'verblijf vanaf 7 november', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 64903.69),
  ('f_0536', '202503758', 'WLZ', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 51104.51),
  ('f_0537', '202503765', 'Ambulant', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 6395.91),
  ('f_0538', '202503772', 'Fasewonen', 'Elin Verburg', 'cl_284', '284', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 77187.68),
  ('f_0539', '202503779', 'verblijf', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 49251.05),
  ('f_0540', '202503786', 'Gecombineerd', 'Dries Dekker', 'cl_12', '12', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 54625.03),
  ('f_0541', '202503793', 'Verblijf en behandeling', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 76712.42),
  ('f_0542', '202503800', 'ambulant en verblijf', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 48658.42),
  ('f_0543', '202503807', 'fasewonen', 'Linda Otto', 'cl_196', '196', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 19765.37),
  ('f_0544', '202503814', 'fasehuis', 'Nino Joosten', 'cl_197', '197', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 89868.44),
  ('f_0545', '202503821', 'verblijf en behandeling', 'Raymond Ader', 'cl_184', '184', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 61005.46),
  ('f_0546', '202503828', 'verblijf vanaf 7 november', 'Ahmet Kat', 'cl_203', '203', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 31418.86),
  ('f_0547', '202503835', 'WLZ', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2021 - 31 juli 2021', '11 mrt 2025', 'Betaald', 2375.46),
  ('f_0548', '202503842', 'Ambulant', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 72535.76),
  ('f_0549', '202503849', 'Fasewonen', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 44663.15),
  ('f_0550', '202503856', 'verblijf', 'Sayed Danish', 'cl_253', '253', '1 april 2021 - 30 april 2021', '10 mrt 2025', 'Betaald', 14684.67),
  ('f_0551', '202503863', 'Gecombineerd', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 72034.31),
  ('f_0552', '202503870', 'Verblijf en behandeling', 'Mahesh Don', 'cl_237', '237', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 43106.34),
  ('f_0553', '202503877', 'ambulant en verblijf', 'Denisha Wortel', 'cl_178', '178', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 15021.3),
  ('f_0554', '202503884', 'fasewonen', 'Shadena Bauman', 'cl_206', '206', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 84405.6),
  ('f_0555', '202503891', 'fasehuis', 'Sara Narouz', 'cl_302', '302', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 54581.35),
  ('f_0556', '202503898', 'verblijf en behandeling', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 9837.95),
  ('f_0557', '202503905', 'verblijf vanaf 7 november', 'Pelle van Stee', 'cl_278', '278', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 96505.29),
  ('f_0558', '202503912', 'WLZ', 'Joyce Voetel', 'cl_188', '188', '1 april 2025 - 30 april 2025', '9 mrt 2025', 'Betaald', 68511.43),
  ('f_0559', '202503919', 'Ambulant', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 38836.56),
  ('f_0560', '202503926', 'Fasewonen', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 10035.66),
  ('f_0561', '202503933', 'verblijf', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2025 - 31 januari 2025', '8 mrt 2025', 'Betaald', 66242.64),
  ('f_0562', '202503940', 'Gecombineerd', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 37347.65),
  ('f_0563', '202503947', 'Verblijf en behandeling', 'Arsalan Koula', 'cl_337', '337', '1 juli 2023 - 31 juli 2023', '2 mrt 2025', 'Betaald', 8475.94),
  ('f_0564', '202503954', 'ambulant en verblijf', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 79548.04),
  ('f_0565', '202503961', 'fasewonen', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2021 - 31 januari 2021', '18 mrt 2025', 'Betaald', 49682.08),
  ('f_0566', '202503968', 'fasehuis', 'Jordy Lont', 'cl_326', '326', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 20819.1),
  ('f_0567', '202503975', 'verblijf en behandeling', 'Romano Leone', 'cl_335', '335', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 90894.04),
  ('f_0568', '202503982', 'verblijf vanaf 7 november', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 62000.02),
  ('f_0569', '202503989', 'WLZ', 'Dylaila Birney', 'cl_327', '327', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 33130.25),
  ('f_0570', '202503996', 'Ambulant', 'Maik Meijerink', 'cl_328', '328', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 4233.32),
  ('f_0571', '202504003', 'Fasewonen', 'Dana Ligthart', 'cl_330', '330', '1 juli 2021 - 31 juli 2021', '20 mrt 2025', 'Betaald', 61472.38),
  ('f_0572', '202504010', 'verblijf', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2023 - 31 oktober 2023', '3 mrt 2025', 'Betaald', 32575.45),
  ('f_0573', '202504017', 'Gecombineerd', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 3707.62),
  ('f_0574', '202504024', 'Verblijf en behandeling', 'Nadia Trela', 'cl_322', '322', '1 april 2021 - 30 april 2021', '1 mrt 2025', 'Betaald', 73812.63),
  ('f_0575', '202504031', 'ambulant en verblijf', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 44917.64),
  ('f_0576', '202504038', 'fasewonen', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2025 - 31 oktober 2025', '17 mrt 2025', 'Betaald', 16018.77),
  ('f_0577', '202504045', 'fasehuis', 'Divano Vrij', 'cl_320', '320', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 86126.69),
  ('f_0578', '202504052', 'verblijf en behandeling', 'Elona van Milligen', 'cl_319', '319', '1 april 2023 - 30 april 2023', '11 mrt 2025', 'Betaald', 57252.07),
  ('f_0579', '202504059', 'verblijf vanaf 7 november', 'Destiny Boot', 'cl_318', '318', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 28357.08),
  ('f_0580', '202504066', 'WLZ', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2021 - 31 oktober 2021', '6 mrt 2025', 'Betaald', 98462.09),
  ('f_0581', '202504073', 'Ambulant', 'Sara Kapli', 'cl_313', '313', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 56727.34),
  ('f_0582', '202504080', 'Fasewonen', 'Tshayren Landveld', 'cl_315', '315', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 27829.44),
  ('f_0583', '202504087', 'verblijf', 'Nikki Boekel', 'cl_216', '216', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 98864.68),
  ('f_0584', '202504094', 'Gecombineerd', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 69064.68),
  ('f_0585', '202504101', 'Verblijf en behandeling', 'Iris Brouwer', 'cl_311', '311', '1 januari 2025 - 31 januari 2025', '21 mrt 2025', 'Betaald', 40145.44),
  ('f_0586', '202504108', 'ambulant en verblijf', 'Annabel Dikmans', 'cl_90', '90', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 96681.58),
  ('f_0587', '202504115', 'fasewonen', 'Sara Ali', 'cl_209', '209', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 82308),
  ('f_0588', '202504122', 'fasehuis', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 53239.38),
  ('f_0589', '202504129', 'verblijf en behandeling', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 25449.22),
  ('f_0590', '202504136', 'verblijf vanaf 7 november', 'Storm Kueter', 'cl_297', '297', '1 april 2023 - 30 april 2023', '23 mrt 2025', 'Betaald', 94351.43),
  ('f_0591', '202504143', 'WLZ', 'Roma Baltus', 'cl_152', '152', '1 juli 2025 - 31 juli 2025', '11 mrt 2025', 'Betaald', 53670.1),
  ('f_0592', '202504150', 'Ambulant', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 24648.04),
  ('f_0593', '202504157', 'Fasewonen', 'Ricardo Rens', 'cl_267', '267', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 93911.09),
  ('f_0594', '202504164', 'verblijf', 'Donique de Nijs', 'cl_204', '204', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 65198.46),
  ('f_0595', '202504171', 'Gecombineerd', 'Grace de Moor', 'cl_301', '301', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 35373.24),
  ('f_0596', '202504178', 'Verblijf en behandeling', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2023 - 31 oktober 2023', '21 mrt 2025', 'Betaald', 7137.85),
  ('f_0597', '202504185', 'ambulant en verblijf', 'Danique Rietveld', 'cl_309', '309', '1 januari 2025 - 31 januari 2025', '16 mrt 2025', 'Betaald', 76573.56),
  ('f_0598', '202504192', 'fasewonen', 'Nora Halbesma', 'cl_176', '176', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 49334.36),
  ('f_0599', '202504199', 'fasehuis', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 19479.07),
  ('f_0600', '202504206', 'verblijf en behandeling', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 90517.22),
  ('f_0601', '202504213', 'verblijf vanaf 7 november', 'Jason Beltzer', 'cl_21', '21', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 63468.07),
  ('f_0602', '202504220', 'WLZ', 'Albina Zeneli', 'cl_246', '246', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 16943.12),
  ('f_0603', '202504227', 'Ambulant', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 86954.04),
  ('f_0604', '202504234', 'Fasewonen', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 58997.04),
  ('f_0605', '202504241', 'verblijf', 'Jay Stevens', 'cl_171', '171', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 30102.05),
  ('f_0606', '202504248', 'Gecombineerd', 'Danielle Lamping', 'cl_275', '275', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 270.04),
  ('f_0607', '202504255', 'Verblijf en behandeling', 'Eliza Zwart', 'cl_293', '293', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 70315.88),
  ('f_0608', '202504262', 'ambulant en verblijf', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 41534.38),
  ('f_0609', '202504269', 'fasewonen', 'Cloe Brown', 'cl_165', '165', '1 januari 2025 - 31 januari 2025', '12 mrt 2025', 'Betaald', 13544.4),
  ('f_0610', '202504276', 'fasehuis', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 82713.36),
  ('f_0611', '202504283', 'verblijf en behandeling', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 40891.31),
  ('f_0612', '202504290', 'verblijf vanaf 7 november', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 12025.42),
  ('f_0613', '202504297', 'WLZ', 'Silas Breederveld', 'cl_228', '228', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 82303.09),
  ('f_0614', '202504304', 'Ambulant', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 53204.4),
  ('f_0615', '202504311', 'Fasewonen', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 24362.76),
  ('f_0616', '202504318', 'verblijf', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 97230.14),
  ('f_0617', '202504325', 'Gecombineerd', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 64854.98),
  ('f_0618', '202504332', 'Verblijf en behandeling', 'Elin Verburg', 'cl_284', '284', '1 april 2025 - 30 april 2025', '10 mrt 2025', 'Betaald', 36646.75),
  ('f_0619', '202504339', 'ambulant en verblijf', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 8710.12),
  ('f_0620', '202504346', 'fasewonen', 'Dries Dekker', 'cl_12', '12', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 1750.66),
  ('f_0621', '202504353', 'fasehuis', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 36171.49),
  ('f_0622', '202504360', 'verblijf en behandeling', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 8117.49),
  ('f_0623', '202504367', 'verblijf vanaf 7 november', 'Linda Otto', 'cl_196', '196', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 78224.44),
  ('f_0624', '202504374', 'WLZ', 'Nino Joosten', 'cl_197', '197', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 49327.51),
  ('f_0625', '202504381', 'Ambulant', 'Raymond Ader', 'cl_184', '184', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 20464.53),
  ('f_0626', '202504388', 'Fasewonen', 'Ahmet Kat', 'cl_203', '203', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 89877.93),
  ('f_0627', '202504395', 'verblijf', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 60834.53),
  ('f_0628', '202504402', 'Gecombineerd', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 31994.83),
  ('f_0629', '202504409', 'Verblijf en behandeling', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 4122.22),
  ('f_0630', '202504416', 'ambulant en verblijf', 'Sayed Danish', 'cl_253', '253', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 73143.74),
  ('f_0631', '202504423', 'fasewonen', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2021 - 31 juli 2021', '15 mrt 2025', 'Betaald', 31493.38),
  ('f_0632', '202504430', 'fasehuis', 'Mahesh Don', 'cl_237', '237', '1 oktober 2023 - 31 oktober 2023', '16 mrt 2025', 'Betaald', 2565.41),
  ('f_0633', '202504437', 'verblijf en behandeling', 'Denisha Wortel', 'cl_178', '178', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 73480.37),
  ('f_0634', '202504444', 'verblijf vanaf 7 november', 'Shadena Bauman', 'cl_206', '206', '1 april 2021 - 30 april 2021', '3 mrt 2025', 'Betaald', 43864.67),
  ('f_0635', '202504451', 'WLZ', 'Sara Narouz', 'cl_302', '302', '1 juli 2023 - 31 juli 2023', '5 mrt 2025', 'Betaald', 14040.42),
  ('f_0636', '202504458', 'Ambulant', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 55963.58),
  ('f_0637', '202504465', 'Fasewonen', 'Pelle van Stee', 'cl_278', '278', '1 januari 2021 - 31 januari 2021', '11 mrt 2025', 'Betaald', 55964.36),
  ('f_0638', '202504472', 'verblijf', 'Joyce Voetel', 'cl_188', '188', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 27970.5),
  ('f_0639', '202504479', 'Gecombineerd', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 97295.63),
  ('f_0640', '202504486', 'Verblijf en behandeling', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2021 - 31 oktober 2021', '13 mrt 2025', 'Betaald', 68494.73),
  ('f_0641', '202504493', 'ambulant en verblijf', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 25701.71),
  ('f_0642', '202504500', 'fasewonen', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 95806.72),
  ('f_0643', '202504507', 'fasehuis', 'Arsalan Koula', 'cl_337', '337', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 66935.01),
  ('f_0644', '202504514', 'verblijf en behandeling', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 39007.11),
  ('f_0645', '202504521', 'verblijf vanaf 7 november', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 9141.15),
  ('f_0646', '202504528', 'WLZ', 'Jordy Lont', 'cl_326', '326', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 79278.17),
  ('f_0647', '202504535', 'Ambulant', 'Romano Leone', 'cl_335', '335', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 50353.11),
  ('f_0648', '202504542', 'Fasewonen', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2025 - 31 oktober 2025', '17 mrt 2025', 'Betaald', 21459.09),
  ('f_0649', '202504549', 'verblijf', 'Dylaila Birney', 'cl_327', '327', '1 januari 2021 - 31 januari 2021', '3 mrt 2025', 'Betaald', 91589.32),
  ('f_0650', '202504556', 'Gecombineerd', 'Maik Meijerink', 'cl_328', '328', '1 april 2023 - 30 april 2023', '11 mrt 2025', 'Betaald', 62692.39),
  ('f_0651', '202504563', 'Verblijf en behandeling', 'Dana Ligthart', 'cl_330', '330', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 20931.45),
  ('f_0652', '202504570', 'ambulant en verblijf', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 91034.52),
  ('f_0653', '202504577', 'fasewonen', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 62166.69),
  ('f_0654', '202504584', 'fasehuis', 'Nadia Trela', 'cl_322', '322', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 33271.7),
  ('f_0655', '202504591', 'verblijf en behandeling', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 4376.71),
  ('f_0656', '202504598', 'verblijf vanaf 7 november', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 74477.84),
  ('f_0657', '202504605', 'WLZ', 'Divano Vrij', 'cl_320', '320', '1 januari 2025 - 31 januari 2025', '21 mrt 2025', 'Betaald', 45585.76),
  ('f_0658', '202504612', 'Ambulant', 'Elona van Milligen', 'cl_319', '319', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 16711.14),
  ('f_0659', '202504619', 'Fasewonen', 'Destiny Boot', 'cl_318', '318', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 86816.15),
  ('f_0660', '202504626', 'verblijf', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 57921.16),
  ('f_0661', '202504633', 'Gecombineerd', 'Sara Kapli', 'cl_313', '313', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 16186.41),
  ('f_0662', '202504640', 'Verblijf en behandeling', 'Tshayren Landveld', 'cl_315', '315', '1 april 2023 - 30 april 2023', '6 mrt 2025', 'Betaald', 86288.51),
  ('f_0663', '202504647', 'ambulant en verblijf', 'Nikki Boekel', 'cl_216', '216', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 58323.75),
  ('f_0664', '202504654', 'fasewonen', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 28523.75),
  ('f_0665', '202504661', 'fasehuis', 'Iris Brouwer', 'cl_311', '311', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 98604.51),
  ('f_0666', '202504668', 'verblijf en behandeling', 'Annabel Dikmans', 'cl_90', '90', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 43807.21),
  ('f_0667', '202504675', 'verblijf vanaf 7 november', 'Sara Ali', 'cl_209', '209', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 41767.07),
  ('f_0668', '202504682', 'WLZ', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2023 - 31 oktober 2023', '20 mrt 2025', 'Betaald', 12698.45),
  ('f_0669', '202504689', 'Ambulant', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 83908.29),
  ('f_0670', '202504696', 'Fasewonen', 'Storm Kueter', 'cl_297', '297', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 53810.5),
  ('f_0671', '202504703', 'verblijf', 'Roma Baltus', 'cl_152', '152', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 13129.17),
  ('f_0672', '202504710', 'Gecombineerd', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 83107.11),
  ('f_0673', '202504717', 'Verblijf en behandeling', 'Ricardo Rens', 'cl_267', '267', '1 januari 2021 - 31 januari 2021', '23 mrt 2025', 'Betaald', 53370.16),
  ('f_0674', '202504724', 'ambulant en verblijf', 'Donique de Nijs', 'cl_204', '204', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 24657.53),
  ('f_0675', '202504731', 'fasewonen', 'Grace de Moor', 'cl_301', '301', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 93832.31),
  ('f_0676', '202504738', 'fasehuis', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 65596.92),
  ('f_0677', '202504745', 'verblijf en behandeling', 'Danique Rietveld', 'cl_309', '309', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 36032.63),
  ('f_0678', '202504752', 'verblijf vanaf 7 november', 'Nora Halbesma', 'cl_176', '176', '1 april 2025 - 30 april 2025', '24 mrt 2025', 'Betaald', 8793.43),
  ('f_0679', '202504759', 'WLZ', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2021 - 31 juli 2021', '19 mrt 2025', 'Betaald', 77938.14),
  ('f_0680', '202504766', 'Ambulant', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2023 - 31 oktober 2023', '16 mrt 2025', 'Betaald', 49976.29),
  ('f_0681', '202504773', 'Fasewonen', 'Jason Beltzer', 'cl_21', '21', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 96751.03),
  ('f_0682', '202504780', 'verblijf', 'Albina Zeneli', 'cl_246', '246', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 77524.96),
  ('f_0683', '202504787', 'Gecombineerd', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 48535.88),
  ('f_0684', '202504794', 'Verblijf en behandeling', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 20578.88),
  ('f_0685', '202504801', 'ambulant en verblijf', 'Jay Stevens', 'cl_171', '171', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 90683.89),
  ('f_0686', '202504808', 'fasewonen', 'Danielle Lamping', 'cl_275', '275', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 60851.88),
  ('f_0687', '202504815', 'fasehuis', 'Eliza Zwart', 'cl_293', '293', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 31897.72),
  ('f_0688', '202504822', 'verblijf en behandeling', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 3116.22),
  ('f_0689', '202504829', 'verblijf vanaf 7 november', 'Cloe Brown', 'cl_165', '165', '1 januari 2023 - 31 januari 2023', '19 mrt 2025', 'Betaald', 74126.24),
  ('f_0690', '202504836', 'WLZ', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 44295.2),
  ('f_0691', '202504843', 'Ambulant', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 2473.15),
  ('f_0692', '202504850', 'Fasewonen', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 72607.26),
  ('f_0693', '202504857', 'verblijf', 'Silas Breederveld', 'cl_228', '228', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 43884.93),
  ('f_0694', '202504864', 'Gecombineerd', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 14786.24),
  ('f_0695', '202504871', 'Verblijf en behandeling', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 84944.6),
  ('f_0696', '202504878', 'ambulant en verblijf', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 31513.1),
  ('f_0697', '202504885', 'fasewonen', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 26436.82),
  ('f_0698', '202504892', 'fasehuis', 'Elin Verburg', 'cl_284', '284', '1 april 2023 - 30 april 2023', '17 mrt 2025', 'Betaald', 97228.59),
  ('f_0699', '202504899', 'verblijf en behandeling', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 69291.96),
  ('f_0700', '202504906', 'verblijf vanaf 7 november', 'Dries Dekker', 'cl_12', '12', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 35033.62),
  ('f_0701', '202504913', 'WLZ', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2023 - 31 januari 2023', '24 mrt 2025', 'Betaald', 94630.56),
  ('f_0702', '202504920', 'Ambulant', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 66576.56),
  ('f_0703', '202504927', 'Fasewonen', 'Linda Otto', 'cl_196', '196', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 37683.51),
  ('f_0704', '202504934', 'verblijf', 'Nino Joosten', 'cl_197', '197', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 8786.58),
  ('f_0705', '202504941', 'Gecombineerd', 'Raymond Ader', 'cl_184', '184', '1 januari 2025 - 31 januari 2025', '14 mrt 2025', 'Betaald', 78923.6),
  ('f_0706', '202504948', 'Verblijf en behandeling', 'Ahmet Kat', 'cl_203', '203', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 49337),
  ('f_0707', '202504955', 'ambulant en verblijf', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 20293.6),
  ('f_0708', '202504962', 'fasewonen', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 90453.9),
  ('f_0709', '202504969', 'fasehuis', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 62581.29),
  ('f_0710', '202504976', 'verblijf en behandeling', 'Sayed Danish', 'cl_253', '253', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 32602.81),
  ('f_0711', '202504983', 'verblijf vanaf 7 november', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 89952.45),
  ('f_0712', '202504990', 'WLZ', 'Mahesh Don', 'cl_237', '237', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 61024.48),
  ('f_0713', '202504997', 'Ambulant', 'Denisha Wortel', 'cl_178', '178', '1 januari 2023 - 31 januari 2023', '2 mrt 2025', 'Betaald', 32939.44),
  ('f_0714', '202505004', 'Fasewonen', 'Shadena Bauman', 'cl_206', '206', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 3323.74),
  ('f_0715', '202505011', 'verblijf', 'Sara Narouz', 'cl_302', '302', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 72499.49),
  ('f_0716', '202505018', 'Gecombineerd', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2023 - 31 oktober 2023', '24 mrt 2025', 'Betaald', 3089.21),
  ('f_0717', '202505025', 'Verblijf en behandeling', 'Pelle van Stee', 'cl_278', '278', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 15423.43),
  ('f_0718', '202505032', 'ambulant en verblijf', 'Joyce Voetel', 'cl_188', '188', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 86429.57),
  ('f_0719', '202505039', 'fasewonen', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2023 - 31 juli 2023', '22 mrt 2025', 'Betaald', 56754.7),
  ('f_0720', '202505046', 'fasehuis', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 27953.8),
  ('f_0721', '202505053', 'verblijf en behandeling', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 84160.78),
  ('f_0722', '202505060', 'verblijf vanaf 7 november', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2023 - 30 april 2023', '25 mrt 2025', 'Betaald', 55265.79),
  ('f_0723', '202505067', 'WLZ', 'Arsalan Koula', 'cl_337', '337', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 26394.08),
  ('f_0724', '202505074', 'Ambulant', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 97466.18),
  ('f_0725', '202505081', 'Fasewonen', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 67600.22),
  ('f_0726', '202505088', 'verblijf', 'Jordy Lont', 'cl_326', '326', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 38737.24),
  ('f_0727', '202505095', 'Gecombineerd', 'Romano Leone', 'cl_335', '335', '1 juli 2021 - 31 juli 2021', '22 mrt 2025', 'Betaald', 9812.18),
  ('f_0728', '202505102', 'Verblijf en behandeling', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 79918.16),
  ('f_0729', '202505109', 'ambulant en verblijf', 'Dylaila Birney', 'cl_327', '327', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 51048.39),
  ('f_0730', '202505116', 'fasewonen', 'Maik Meijerink', 'cl_328', '328', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 22151.46),
  ('f_0731', '202505123', 'fasehuis', 'Dana Ligthart', 'cl_330', '330', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 79390.52),
  ('f_0732', '202505130', 'verblijf en behandeling', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 50493.59),
  ('f_0733', '202505137', 'verblijf vanaf 7 november', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2021 - 31 januari 2021', '23 mrt 2025', 'Betaald', 21625.76),
  ('f_0734', '202505144', 'WLZ', 'Nadia Trela', 'cl_322', '322', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 91730.77),
  ('f_0735', '202505151', 'Ambulant', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2025 - 31 juli 2025', '18 mrt 2025', 'Betaald', 62835.78),
  ('f_0736', '202505158', 'Fasewonen', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 33936.91),
  ('f_0737', '202505165', 'verblijf', 'Divano Vrij', 'cl_320', '320', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 5044.83),
  ('f_0738', '202505172', 'Gecombineerd', 'Elona van Milligen', 'cl_319', '319', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 75170.21),
  ('f_0739', '202505179', 'Verblijf en behandeling', 'Destiny Boot', 'cl_318', '318', '1 juli 2021 - 31 juli 2021', '3 mrt 2025', 'Betaald', 46275.22),
  ('f_0740', '202505186', 'ambulant en verblijf', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 17380.23),
  ('f_0741', '202505193', 'fasewonen', 'Sara Kapli', 'cl_313', '313', '1 januari 2025 - 31 januari 2025', '15 mrt 2025', 'Betaald', 74645.48),
  ('f_0742', '202505200', 'fasehuis', 'Tshayren Landveld', 'cl_315', '315', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 45747.58),
  ('f_0743', '202505207', 'verblijf en behandeling', 'Nikki Boekel', 'cl_216', '216', '1 juli 2023 - 31 juli 2023', '16 mrt 2025', 'Betaald', 17782.82),
  ('f_0744', '202505214', 'verblijf vanaf 7 november', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 86982.82),
  ('f_0745', '202505221', 'WLZ', 'Iris Brouwer', 'cl_311', '311', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 58063.58),
  ('f_0746', '202505228', 'Ambulant', 'Annabel Dikmans', 'cl_90', '90', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 89932.84),
  ('f_0747', '202505235', 'Fasewonen', 'Sara Ali', 'cl_209', '209', '1 juli 2025 - 31 juli 2025', '5 mrt 2025', 'Betaald', 1226.14),
  ('f_0748', '202505242', 'verblijf', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 71157.52),
  ('f_0749', '202505249', 'Gecombineerd', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2023 - 31 januari 2023', '10 mrt 2025', 'Betaald', 43367.36),
  ('f_0750', '202505256', 'Verblijf en behandeling', 'Storm Kueter', 'cl_297', '297', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 13269.57),
  ('f_0751', '202505263', 'ambulant en verblijf', 'Roma Baltus', 'cl_152', '152', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 71588.24),
  ('f_0752', '202505270', 'fasewonen', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 42566.18),
  ('f_0753', '202505277', 'fasehuis', 'Ricardo Rens', 'cl_267', '267', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 12829.23),
  ('f_0754', '202505284', 'verblijf en behandeling', 'Donique de Nijs', 'cl_204', '204', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 83116.6),
  ('f_0755', '202505291', 'verblijf vanaf 7 november', 'Grace de Moor', 'cl_301', '301', '1 juli 2023 - 31 juli 2023', '13 mrt 2025', 'Betaald', 53291.38),
  ('f_0756', '202505298', 'WLZ', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 25055.99),
  ('f_0757', '202505305', 'Ambulant', 'Danique Rietveld', 'cl_309', '309', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 94491.7),
  ('f_0758', '202505312', 'Fasewonen', 'Nora Halbesma', 'cl_176', '176', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 67252.5),
  ('f_0759', '202505319', 'verblijf', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 37397.21),
  ('f_0760', '202505326', 'Gecombineerd', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 9435.36),
  ('f_0761', '202505333', 'Verblijf en behandeling', 'Jason Beltzer', 'cl_21', '21', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 43876.66),
  ('f_0762', '202505340', 'ambulant en verblijf', 'Albina Zeneli', 'cl_246', '246', '1 april 2025 - 30 april 2025', '22 mrt 2025', 'Betaald', 36984.03),
  ('f_0763', '202505347', 'fasewonen', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 7994.95),
  ('f_0764', '202505354', 'fasehuis', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 79037.95),
  ('f_0765', '202505361', 'verblijf en behandeling', 'Jay Stevens', 'cl_171', '171', '1 januari 2025 - 31 januari 2025', '22 mrt 2025', 'Betaald', 50142.96),
  ('f_0766', '202505368', 'verblijf vanaf 7 november', 'Danielle Lamping', 'cl_275', '275', '1 april 2021 - 30 april 2021', '16 mrt 2025', 'Betaald', 20310.95),
  ('f_0767', '202505375', 'WLZ', 'Eliza Zwart', 'cl_293', '293', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 90356.79),
  ('f_0768', '202505382', 'Ambulant', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2025 - 31 oktober 2025', '17 mrt 2025', 'Betaald', 61575.29),
  ('f_0769', '202505389', 'Fasewonen', 'Cloe Brown', 'cl_165', '165', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 33585.31),
  ('f_0770', '202505396', 'verblijf', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2023 - 30 april 2023', '5 mrt 2025', 'Betaald', 3754.27),
  ('f_0771', '202505403', 'Gecombineerd', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2025 - 31 juli 2025', '17 mrt 2025', 'Betaald', 60932.22),
  ('f_0772', '202505410', 'Verblijf en behandeling', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2021 - 31 oktober 2021', '7 mrt 2025', 'Betaald', 32066.33),
  ('f_0773', '202505417', 'ambulant en verblijf', 'Silas Breederveld', 'cl_228', '228', '1 januari 2023 - 31 januari 2023', '20 mrt 2025', 'Betaald', 3344),
  ('f_0774', '202505424', 'fasewonen', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2025 - 30 april 2025', '20 mrt 2025', 'Betaald', 73245.31),
  ('f_0775', '202505431', 'fasehuis', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 44403.67),
  ('f_0776', '202505438', 'verblijf en behandeling', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2023 - 31 oktober 2023', '10 mrt 2025', 'Betaald', 77638.73),
  ('f_0777', '202505445', 'verblijf vanaf 7 november', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 84895.89),
  ('f_0778', '202505452', 'WLZ', 'Elin Verburg', 'cl_284', '284', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 56687.66),
  ('f_0779', '202505459', 'Ambulant', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 28751.03),
  ('f_0780', '202505466', 'Fasewonen', 'Dries Dekker', 'cl_12', '12', '1 oktober 2025 - 31 oktober 2025', '9 mrt 2025', 'Betaald', 81159.25),
  ('f_0781', '202505473', 'verblijf', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2021 - 31 januari 2021', '6 mrt 2025', 'Betaald', 56212.4),
  ('f_0782', '202505480', 'Gecombineerd', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 28158.4),
  ('f_0783', '202505487', 'Verblijf en behandeling', 'Linda Otto', 'cl_196', '196', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 98265.35),
  ('f_0784', '202505494', 'ambulant en verblijf', 'Nino Joosten', 'cl_197', '197', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 69368.42),
  ('f_0785', '202505501', 'fasewonen', 'Raymond Ader', 'cl_184', '184', '1 januari 2023 - 31 januari 2023', '21 mrt 2025', 'Betaald', 40505.44),
  ('f_0786', '202505508', 'fasehuis', 'Ahmet Kat', 'cl_203', '203', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 10918.84),
  ('f_0787', '202505515', 'verblijf en behandeling', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 80875.44),
  ('f_0788', '202505522', 'verblijf vanaf 7 november', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 52035.74),
  ('f_0789', '202505529', 'WLZ', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 24163.13),
  ('f_0790', '202505536', 'Ambulant', 'Sayed Danish', 'cl_253', '253', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 93184.65),
  ('f_0791', '202505543', 'Fasewonen', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 51534.29),
  ('f_0792', '202505550', 'verblijf', 'Mahesh Don', 'cl_237', '237', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 22606.32),
  ('f_0793', '202505557', 'Gecombineerd', 'Denisha Wortel', 'cl_178', '178', '1 januari 2021 - 31 januari 2021', '9 mrt 2025', 'Betaald', 93521.28),
  ('f_0794', '202505564', 'Verblijf en behandeling', 'Shadena Bauman', 'cl_206', '206', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 63905.58),
  ('f_0795', '202505571', 'ambulant en verblijf', 'Sara Narouz', 'cl_302', '302', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 34081.33),
  ('f_0796', '202505578', 'fasewonen', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2021 - 31 oktober 2021', '2 mrt 2025', 'Betaald', 36372.17),
  ('f_0797', '202505585', 'fasehuis', 'Pelle van Stee', 'cl_278', '278', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 76005.27),
  ('f_0798', '202505592', 'verblijf en behandeling', 'Joyce Voetel', 'cl_188', '188', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 48011.41),
  ('f_0799', '202505599', 'verblijf vanaf 7 november', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2021 - 31 juli 2021', '4 mrt 2025', 'Betaald', 18336.54),
  ('f_0800', '202505606', 'WLZ', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 88535.64),
  ('f_0801', '202505613', 'Ambulant', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 43619.85),
  ('f_0802', '202505620', 'Fasewonen', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 14724.86),
  ('f_0803', '202505627', 'verblijf', 'Arsalan Koula', 'cl_337', '337', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 84853.15),
  ('f_0804', '202505634', 'Gecombineerd', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2025 - 31 oktober 2025', '7 mrt 2025', 'Betaald', 56925.25),
  ('f_0805', '202505641', 'Verblijf en behandeling', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 27059.29),
  ('f_0806', '202505648', 'ambulant en verblijf', 'Jordy Lont', 'cl_326', '326', '1 april 2023 - 30 april 2023', '9 mrt 2025', 'Betaald', 97196.31),
  ('f_0807', '202505655', 'fasewonen', 'Romano Leone', 'cl_335', '335', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 68271.25),
  ('f_0808', '202505662', 'fasehuis', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 39377.23),
  ('f_0809', '202505669', 'verblijf en behandeling', 'Dylaila Birney', 'cl_327', '327', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 10507.46),
  ('f_0810', '202505676', 'verblijf vanaf 7 november', 'Maik Meijerink', 'cl_328', '328', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 80610.53),
  ('f_0811', '202505683', 'WLZ', 'Dana Ligthart', 'cl_330', '330', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 38849.59),
  ('f_0812', '202505690', 'Ambulant', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 9952.66),
  ('f_0813', '202505697', 'Fasewonen', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 80084.83),
  ('f_0814', '202505704', 'verblijf', 'Nadia Trela', 'cl_322', '322', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 51189.84),
  ('f_0815', '202505711', 'Gecombineerd', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 22294.85),
  ('f_0816', '202505718', 'Verblijf en behandeling', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 92395.98),
  ('f_0817', '202505725', 'ambulant en verblijf', 'Divano Vrij', 'cl_320', '320', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 63503.9),
  ('f_0818', '202505732', 'fasewonen', 'Elona van Milligen', 'cl_319', '319', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 34629.28),
  ('f_0819', '202505739', 'fasehuis', 'Destiny Boot', 'cl_318', '318', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 5734.29),
  ('f_0820', '202505746', 'verblijf en behandeling', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 75839.3),
  ('f_0821', '202505753', 'verblijf vanaf 7 november', 'Sara Kapli', 'cl_313', '313', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 34104.55),
  ('f_0822', '202505760', 'WLZ', 'Tshayren Landveld', 'cl_315', '315', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 5206.65),
  ('f_0823', '202505767', 'Ambulant', 'Nikki Boekel', 'cl_216', '216', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 76241.89),
  ('f_0824', '202505774', 'Fasewonen', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2023 - 31 oktober 2023', '9 mrt 2025', 'Betaald', 46441.89),
  ('f_0825', '202505781', 'verblijf', 'Iris Brouwer', 'cl_311', '311', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 17522.65),
  ('f_0826', '202505788', 'Gecombineerd', 'Annabel Dikmans', 'cl_90', '90', '1 april 2021 - 30 april 2021', '2 mrt 2025', 'Betaald', 37058.47),
  ('f_0827', '202505795', 'Verblijf en behandeling', 'Sara Ali', 'cl_209', '209', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 59685.21),
  ('f_0828', '202505802', 'ambulant en verblijf', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 30616.59),
  ('f_0829', '202505809', 'fasewonen', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 2826.43),
  ('f_0830', '202505816', 'fasehuis', 'Storm Kueter', 'cl_297', '297', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 71728.64),
  ('f_0831', '202505823', 'verblijf en behandeling', 'Roma Baltus', 'cl_152', '152', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 31047.31),
  ('f_0832', '202505830', 'verblijf vanaf 7 november', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2021 - 31 oktober 2021', '13 mrt 2025', 'Betaald', 2025.25),
  ('f_0833', '202505837', 'WLZ', 'Ricardo Rens', 'cl_267', '267', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 71288.3),
  ('f_0834', '202505844', 'Ambulant', 'Donique de Nijs', 'cl_204', '204', '1 april 2025 - 30 april 2025', '3 mrt 2025', 'Betaald', 42575.67),
  ('f_0835', '202505851', 'Fasewonen', 'Grace de Moor', 'cl_301', '301', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 12750.45),
  ('f_0836', '202505858', 'verblijf', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 83515.06),
  ('f_0837', '202505865', 'Gecombineerd', 'Danique Rietveld', 'cl_309', '309', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 53950.77),
  ('f_0838', '202505872', 'Verblijf en behandeling', 'Nora Halbesma', 'cl_176', '176', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 26711.57),
  ('f_0839', '202505879', 'ambulant en verblijf', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 95856.28),
  ('f_0840', '202505886', 'fasewonen', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 67894.43),
  ('f_0841', '202505893', 'fasehuis', 'Jason Beltzer', 'cl_21', '21', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 90002.29),
  ('f_0842', '202505900', 'verblijf en behandeling', 'Albina Zeneli', 'cl_246', '246', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 95443.1),
  ('f_0843', '202505907', 'verblijf vanaf 7 november', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2025 - 31 juli 2025', '1 mrt 2025', 'Betaald', 66454.02),
  ('f_0844', '202505914', 'WLZ', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 38497.02),
  ('f_0845', '202505921', 'Ambulant', 'Jay Stevens', 'cl_171', '171', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 9602.03),
  ('f_0846', '202505928', 'Fasewonen', 'Danielle Lamping', 'cl_275', '275', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 78770.02),
  ('f_0847', '202505935', 'verblijf', 'Eliza Zwart', 'cl_293', '293', '1 juli 2021 - 31 juli 2021', '6 mrt 2025', 'Betaald', 49815.86),
  ('f_0848', '202505942', 'Gecombineerd', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 21034.36),
  ('f_0849', '202505949', 'Verblijf en behandeling', 'Cloe Brown', 'cl_165', '165', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 92044.38),
  ('f_0850', '202505956', 'ambulant en verblijf', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 62213.34),
  ('f_0851', '202505963', 'fasewonen', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 20391.29),
  ('f_0852', '202505970', 'fasehuis', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 90525.4),
  ('f_0853', '202505977', 'verblijf en behandeling', 'Silas Breederveld', 'cl_228', '228', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 61803.07),
  ('f_0854', '202505984', 'verblijf vanaf 7 november', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 32704.38),
  ('f_0855', '202505991', 'WLZ', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2025 - 31 juli 2025', '1 mrt 2025', 'Betaald', 3862.74),
  ('f_0856', '202505998', 'Ambulant', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 24764.36),
  ('f_0857', '202506005', 'Fasewonen', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2023 - 31 januari 2023', '6 mrt 2025', 'Betaald', 44354.96),
  ('f_0858', '202506012', 'verblijf', 'Elin Verburg', 'cl_284', '284', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 16146.73),
  ('f_0859', '202506019', 'Gecombineerd', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2021 - 31 juli 2021', '22 mrt 2025', 'Betaald', 87210.1),
  ('f_0860', '202506026', 'Verblijf en behandeling', 'Dries Dekker', 'cl_12', '12', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 28284.88),
  ('f_0861', '202506033', 'ambulant en verblijf', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 15671.47),
  ('f_0862', '202506040', 'fasewonen', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2021 - 30 april 2021', '24 mrt 2025', 'Betaald', 86617.47),
  ('f_0863', '202506047', 'fasehuis', 'Linda Otto', 'cl_196', '196', '1 juli 2023 - 31 juli 2023', '11 mrt 2025', 'Betaald', 57724.42),
  ('f_0864', '202506054', 'verblijf en behandeling', 'Nino Joosten', 'cl_197', '197', '1 oktober 2025 - 31 oktober 2025', '19 mrt 2025', 'Betaald', 28827.49),
  ('f_0865', '202506061', 'verblijf vanaf 7 november', 'Raymond Ader', 'cl_184', '184', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 98964.51),
  ('f_0866', '202506068', 'WLZ', 'Ahmet Kat', 'cl_203', '203', '1 april 2023 - 30 april 2023', '9 mrt 2025', 'Betaald', 69377.91),
  ('f_0867', '202506075', 'Ambulant', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 40334.51),
  ('f_0868', '202506082', 'Fasewonen', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2021 - 31 oktober 2021', '8 mrt 2025', 'Betaald', 11494.81),
  ('f_0869', '202506089', 'verblijf', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2023 - 31 januari 2023', '22 mrt 2025', 'Betaald', 82622.2),
  ('f_0870', '202506096', 'Gecombineerd', 'Sayed Danish', 'cl_253', '253', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 52643.72),
  ('f_0871', '202506103', 'Verblijf en behandeling', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 10993.36),
  ('f_0872', '202506110', 'ambulant en verblijf', 'Mahesh Don', 'cl_237', '237', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 81065.39),
  ('f_0873', '202506117', 'fasewonen', 'Denisha Wortel', 'cl_178', '178', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 52980.35),
  ('f_0874', '202506124', 'fasehuis', 'Shadena Bauman', 'cl_206', '206', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 23364.65),
  ('f_0875', '202506131', 'verblijf en behandeling', 'Sara Narouz', 'cl_302', '302', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 92540.4),
  ('f_0876', '202506138', 'verblijf vanaf 7 november', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 82497.8),
  ('f_0877', '202506145', 'WLZ', 'Pelle van Stee', 'cl_278', '278', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 35464.34),
  ('f_0878', '202506152', 'Ambulant', 'Joyce Voetel', 'cl_188', '188', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 7470.48),
  ('f_0879', '202506159', 'Fasewonen', 'Diboya Boerlijst', 'cl_235', '235', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 76795.61),
  ('f_0880', '202506166', 'verblijf', 'Jira Tharwarmporn', 'cl_200', '200', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 47994.71),
  ('f_0881', '202506173', 'Gecombineerd', 'Jalaysa Jansen', 'cl_342', '342', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 5201.69),
  ('f_0882', '202506180', 'Verblijf en behandeling', 'Lisanne de Zeeuw', 'cl_341', '341', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 75306.7),
  ('f_0883', '202506187', 'ambulant en verblijf', 'Arsalan Koula', 'cl_337', '337', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 46434.99),
  ('f_0884', '202506194', 'fasewonen', 'Ronique Thakoer', 'cl_221', '221', '1 oktober 2023 - 31 oktober 2023', '14 mrt 2025', 'Betaald', 18507.09),
  ('f_0885', '202506201', 'fasehuis', 'Haifaa Alnakshbandi', 'cl_339', '339', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 87641.13),
  ('f_0886', '202506208', 'verblijf en behandeling', 'Jordy Lont', 'cl_326', '326', '1 april 2021 - 30 april 2021', '16 mrt 2025', 'Betaald', 58778.15),
  ('f_0887', '202506215', 'verblijf vanaf 7 november', 'Romano Leone', 'cl_335', '335', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 29853.09),
  ('f_0888', '202506222', 'WLZ', 'Bella van Meurs', 'cl_333', '333', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 959.07),
  ('f_0889', '202506229', 'Ambulant', 'Dylaila Birney', 'cl_327', '327', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 71089.3),
  ('f_0890', '202506236', 'Fasewonen', 'Maik Meijerink', 'cl_328', '328', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 42192.37),
  ('f_0891', '202506243', 'verblijf', 'Dana Ligthart', 'cl_330', '330', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 431.43),
  ('f_0892', '202506250', 'Gecombineerd', 'Dano de Wagt', 'cl_331', '331', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 70534.5),
  ('f_0893', '202506257', 'Verblijf en behandeling', 'Kim Duinhoven', 'cl_323', '323', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 41666.67),
  ('f_0894', '202506264', 'ambulant en verblijf', 'Nadia Trela', 'cl_322', '322', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 12771.68),
  ('f_0895', '202506271', 'fasewonen', 'Oskar Delendowski', 'cl_321', '321', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 82876.69),
  ('f_0896', '202506278', 'fasehuis', 'Gianluca Frangiamore de Sola', 'cl_324', '324', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 53977.82),
  ('f_0897', '202506285', 'verblijf en behandeling', 'Divano Vrij', 'cl_320', '320', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 25085.74),
  ('f_0898', '202506292', 'verblijf vanaf 7 november', 'Elona van Milligen', 'cl_319', '319', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 95211.12),
  ('f_0899', '202506299', 'WLZ', 'Destiny Boot', 'cl_318', '318', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 66316.13),
  ('f_0900', '202506306', 'Ambulant', 'Shardely Eybrecht', 'cl_317', '317', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 37421.14),
  ('f_0901', '202506313', 'Fasewonen', 'Sara Kapli', 'cl_313', '313', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 92563.62),
  ('f_0902', '202506320', 'verblijf', 'Tshayren Landveld', 'cl_315', '315', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 63665.72),
  ('f_0903', '202506327', 'Gecombineerd', 'Nikki Boekel', 'cl_216', '216', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 35700.96),
  ('f_0904', '202506334', 'Verblijf en behandeling', 'Dylan Kauffman', 'cl_308', '308', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 5900.96),
  ('f_0905', '202506341', 'ambulant en verblijf', 'Iris Brouwer', 'cl_311', '311', '1 januari 2023 - 31 januari 2023', '10 mrt 2025', 'Betaald', 75981.72),
  ('f_0906', '202506348', 'fasewonen', 'Annabel Dikmans', 'cl_90', '90', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 83184.1),
  ('f_0907', '202506355', 'fasehuis', 'Sara Ali', 'cl_209', '209', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 19144.28),
  ('f_0908', '202506362', 'verblijf en behandeling', 'Lucas Kortenhoeven', 'cl_261', '261', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 89075.66),
  ('f_0909', '202506369', 'verblijf vanaf 7 november', 'Neshanti di Perna', 'cl_108', '108', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 61285.5),
  ('f_0910', '202506376', 'WLZ', 'Storm Kueter', 'cl_297', '297', '1 april 2021 - 30 april 2021', '12 mrt 2025', 'Betaald', 31187.71),
  ('f_0911', '202506383', 'Ambulant', 'Roma Baltus', 'cl_152', '152', '1 juli 2023 - 31 juli 2023', '25 mrt 2025', 'Betaald', 89506.38),
  ('f_0912', '202506390', 'Fasewonen', 'Nouska Westerbeek', 'cl_198', '198', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 60484.32),
  ('f_0913', '202506397', 'verblijf', 'Ricardo Rens', 'cl_267', '267', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 30747.37),
  ('f_0914', '202506404', 'Gecombineerd', 'Donique de Nijs', 'cl_204', '204', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 2034.74),
  ('f_0915', '202506411', 'Verblijf en behandeling', 'Grace de Moor', 'cl_301', '301', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 71209.52),
  ('f_0916', '202506418', 'ambulant en verblijf', 'Lotte Schuiling', 'cl_292', '292', '1 oktober 2021 - 31 oktober 2021', '10 mrt 2025', 'Betaald', 42974.13),
  ('f_0917', '202506425', 'fasewonen', 'Danique Rietveld', 'cl_309', '309', '1 januari 2023 - 31 januari 2023', '5 mrt 2025', 'Betaald', 13409.84),
  ('f_0918', '202506432', 'fasehuis', 'Nora Halbesma', 'cl_176', '176', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 85170.64),
  ('f_0919', '202506439', 'verblijf en behandeling', 'Mitch Kloosterman', 'cl_283', '283', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 55315.35),
  ('f_0920', '202506446', 'verblijf vanaf 7 november', 'Joeliza van den Dool', 'cl_181', '181', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 27353.5),
  ('f_0921', '202506453', 'WLZ', 'Jason Beltzer', 'cl_21', '21', '1 januari 2025 - 31 januari 2025', '2 mrt 2025', 'Betaald', 37127.92),
  ('f_0922', '202506460', 'Ambulant', 'Albina Zeneli', 'cl_246', '246', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 54902.17),
  ('f_0923', '202506467', 'Fasewonen', 'Elize Jongebloed', 'cl_279', '279', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 25913.09),
  ('f_0924', '202506474', 'verblijf', 'No?lla Duijvestijn', 'cl_172', '172', '1 oktober 2025 - 31 oktober 2025', '19 mrt 2025', 'Betaald', 96956.09),
  ('f_0925', '202506481', 'Gecombineerd', 'Jay Stevens', 'cl_171', '171', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 68061.1),
  ('f_0926', '202506488', 'Verblijf en behandeling', 'Danielle Lamping', 'cl_275', '275', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 38229.09),
  ('f_0927', '202506495', 'ambulant en verblijf', 'Eliza Zwart', 'cl_293', '293', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 9274.93),
  ('f_0928', '202506502', 'fasewonen', 'Ro?l Spiering', 'cl_259', '259', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 79493.43),
  ('f_0929', '202506509', 'fasehuis', 'Cloe Brown', 'cl_165', '165', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 51503.45),
  ('f_0930', '202506516', 'verblijf en behandeling', 'Jay Arnold Buter', 'cl_268', '268', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 21672.41),
  ('f_0931', '202506523', 'verblijf vanaf 7 november', 'Jorgia Schoenmaker', 'cl_291', '291', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 78850.36),
  ('f_0932', '202506530', 'WLZ', 'Colin Wijngaard', 'cl_281', '281', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 49984.47),
  ('f_0933', '202506537', 'Ambulant', 'Silas Breederveld', 'cl_228', '228', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 21262.14),
  ('f_0934', '202506544', 'Fasewonen', 'Deborah van den Eijnden', 'cl_290', '290', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 91163.45),
  ('f_0935', '202506551', 'verblijf', 'Dion Martis Abukar', 'cl_276', '276', '1 juli 2023 - 31 juli 2023', '-', 'Gedeclareerd en in behandeling', 62321.81),
  ('f_0936', '202506558', 'Gecombineerd', 'Jamey Hofman', 'cl_85', '85', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 70889.99),
  ('f_0937', '202506565', 'Verblijf en behandeling', 'Manaf Ghallab', 'cl_300', '300', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 3814.03),
  ('f_0938', '202506572', 'ambulant en verblijf', 'Elin Verburg', 'cl_284', '284', '1 april 2023 - 30 april 2023', '-', 'Gedeclareerd en in behandeling', 74605.8),
  ('f_0939', '202506579', 'fasewonen', 'Danischa de Vilder', 'cl_177', '177', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 46669.17),
  ('f_0940', '202506586', 'fasehuis', 'Dries Dekker', 'cl_12', '12', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 74410.51),
  ('f_0941', '202506593', 'verblijf en behandeling', 'Kiyaro Lambert', 'cl_269', '269', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 74130.54),
  ('f_0942', '202506600', 'verblijf vanaf 7 november', 'Phobek Mityaniq', 'cl_199', '199', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 46076.54),
  ('f_0943', '202506607', 'WLZ', 'Linda Otto', 'cl_196', '196', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 17183.49),
  ('f_0944', '202506614', 'Ambulant', 'Nino Joosten', 'cl_197', '197', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 87286.56),
  ('f_0945', '202506621', 'Fasewonen', 'Raymond Ader', 'cl_184', '184', '1 januari 2025 - 31 januari 2025', '-', 'Gedeclareerd en in behandeling', 58423.58),
  ('f_0946', '202506628', 'verblijf', 'Ahmet Kat', 'cl_203', '203', '1 april 2021 - 30 april 2021', '-', 'Gedeclareerd en in behandeling', 28836.98),
  ('f_0947', '202506635', 'Gecombineerd', 'Tycho Kauffman', 'cl_250', '250', '1 juli 2023 - 31 juli 2023', '7 mrt 2025', 'Betaald', 98793.58),
  ('f_0948', '202506642', 'Verblijf en behandeling', 'Oliver Schoenmakers', 'cl_234', '234', '1 oktober 2025 - 31 oktober 2025', '-', 'Gedeclareerd en in behandeling', 69953.88),
  ('f_0949', '202506649', 'ambulant en verblijf', 'Shufrandly Faries', 'cl_103', '103', '1 januari 2021 - 31 januari 2021', '-', 'Gedeclareerd en in behandeling', 42081.27),
  ('f_0950', '202506656', 'fasewonen', 'Sayed Danish', 'cl_253', '253', '1 april 2023 - 30 april 2023', '6 mrt 2025', 'Betaald', 12102.79),
  ('f_0951', '202506663', 'fasehuis', 'Tamaika Cooks', 'cl_225', '225', '1 juli 2025 - 31 juli 2025', '-', 'Gedeclareerd en in behandeling', 69452.43),
  ('f_0952', '202506670', 'verblijf en behandeling', 'Mahesh Don', 'cl_237', '237', '1 oktober 2021 - 31 oktober 2021', '-', 'Gedeclareerd en in behandeling', 40524.46),
  ('f_0953', '202506677', 'verblijf vanaf 7 november', 'Denisha Wortel', 'cl_178', '178', '1 januari 2023 - 31 januari 2023', '-', 'Gedeclareerd en in behandeling', 12439.42),
  ('f_0954', '202506684', 'WLZ', 'Shadena Bauman', 'cl_206', '206', '1 april 2025 - 30 april 2025', '-', 'Gedeclareerd en in behandeling', 81823.72),
  ('f_0955', '202506691', 'Ambulant', 'Sara Narouz', 'cl_302', '302', '1 juli 2021 - 31 juli 2021', '-', 'Gedeclareerd en in behandeling', 51999.47),
  ('f_0956', '202506698', 'Fasewonen', 'Mitchel Heijm', 'cl_58', '58', '1 oktober 2023 - 31 oktober 2023', '-', 'Gedeclareerd en in behandeling', 29623.43)
on conflict (id) do nothing;

-- ============================================================================
-- organisaties (Cli?nten module ? referentiedata, verwijzers/zorginstellingen)
-- ============================================================================
--
-- ID is text zodat we de bestaande "org_seed_X" IDs behouden ? net als bij
-- clienten/beschikkingen, om legacy referenties (cli?nt.organisatie als
-- naam-string) niet te breken.

create table if not exists public.organisaties (
  id text primary key,
  naam text not null,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create unique index if not exists organisaties_naam_unique_active
  on public.organisaties (lower(naam))
  where archived = false;

create index if not exists organisaties_archived_idx on public.organisaties (archived);

drop trigger if exists trg_organisaties_set_modified on public.organisaties;
create trigger trg_organisaties_set_modified
  before update on public.organisaties
  for each row execute function public.set_laatst_gewijzigd();

alter table public.organisaties enable row level security;

drop policy if exists "anon kan organisaties lezen" on public.organisaties;
create policy "anon kan organisaties lezen"
  on public.organisaties for select to anon using (true);

drop policy if exists "anon kan organisaties toevoegen" on public.organisaties;
create policy "anon kan organisaties toevoegen"
  on public.organisaties for insert to anon with check (true);

drop policy if exists "anon kan organisaties bewerken" on public.organisaties;
create policy "anon kan organisaties bewerken"
  on public.organisaties for update to anon using (true) with check (true);

drop policy if exists "anon kan organisaties verwijderen" on public.organisaties;
create policy "anon kan organisaties verwijderen"
  on public.organisaties for delete to anon using (true);

-- TOEKOMSTIGE policies (na login activatie):
-- drop policy if exists "anon kan organisaties lezen" on public.organisaties;
-- drop policy if exists "anon kan organisaties toevoegen" on public.organisaties;
-- drop policy if exists "anon kan organisaties bewerken" on public.organisaties;
-- drop policy if exists "anon kan organisaties verwijderen" on public.organisaties;
-- create policy "ingelogd kan organisaties lezen"
--   on public.organisaties for select to authenticated using (true);
-- create policy "ingelogd kan organisaties toevoegen"
--   on public.organisaties for insert to authenticated with check (true);
-- create policy "ingelogd kan organisaties bewerken"
--   on public.organisaties for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan organisaties verwijderen"
--   on public.organisaties for delete to authenticated using (true);

-- Seed van 4 standaard-organisaties. Idempotent op id.
insert into public.organisaties (id, naam)
values
  ('org_seed_1', 'Planet Young'),
  ('org_seed_2', 'Diab'),
  ('org_seed_3', 'Your'),
  ('org_seed_4', 'Gezozorg')
on conflict (id) do nothing;

-- ============================================================================
-- uren_budget (Cli?nten module ? uren-budgettering per week per cli?nt)
-- ============================================================================
--
-- Een cel = (client_id, jaar, week) ? uren. Een cel met uren=0 zou normaal
-- worden weggelaten (cleanup), maar we tolereren ook 0-rijen.

create table if not exists public.uren_budget (
  client_id text not null,
  jaar integer not null,
  week integer not null check (week between 1 and 53),
  uren numeric(8,2) not null default 0,
  laatst_gewijzigd timestamptz not null default now(),
  primary key (client_id, jaar, week)
);

create index if not exists uren_budget_client_idx on public.uren_budget (client_id);
create index if not exists uren_budget_jaar_idx on public.uren_budget (jaar);

drop trigger if exists trg_uren_budget_set_modified on public.uren_budget;
create trigger trg_uren_budget_set_modified
  before update on public.uren_budget
  for each row execute function public.set_laatst_gewijzigd();

alter table public.uren_budget enable row level security;

drop policy if exists "anon kan uren_budget lezen" on public.uren_budget;
create policy "anon kan uren_budget lezen"
  on public.uren_budget for select to anon using (true);

drop policy if exists "anon kan uren_budget toevoegen" on public.uren_budget;
create policy "anon kan uren_budget toevoegen"
  on public.uren_budget for insert to anon with check (true);

drop policy if exists "anon kan uren_budget bewerken" on public.uren_budget;
create policy "anon kan uren_budget bewerken"
  on public.uren_budget for update to anon using (true) with check (true);

drop policy if exists "anon kan uren_budget verwijderen" on public.uren_budget;
create policy "anon kan uren_budget verwijderen"
  on public.uren_budget for delete to anon using (true);

-- TOEKOMSTIGE policies (na login):
-- create policy "ingelogd kan uren_budget lezen"
--   on public.uren_budget for select to authenticated using (true);
-- create policy "ingelogd kan uren_budget toevoegen"
--   on public.uren_budget for insert to authenticated with check (true);
-- create policy "ingelogd kan uren_budget bewerken"
--   on public.uren_budget for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan uren_budget verwijderen"
--   on public.uren_budget for delete to authenticated using (true);

-- Geen seed-data: budgetcellen worden door de gebruiker aangemaakt.

-- ============================================================================
-- planning (HR module ? rooster items per dienst)
-- ============================================================================
--
-- Pragmatische opzet net als medewerkers: een aantal expliciete kolommen voor
-- snelle queries (start/einde/teamlid/locatie/vestiging) en al het andere in
-- 'data jsonb'. Geen harde FK naar medewerkers/clienten omdat we vrijetekst-
-- velden ondersteunen (legacy demo-data, eigen invoer).

create table if not exists public.planning (
  id text primary key,
  start_iso timestamptz,
  einde_iso timestamptz,
  diensttype text,
  afdeling text,
  functie text,
  teamlead text,
  teamlid text,
  client text,
  vestiging text,
  locatie text,
  conflict boolean not null default false,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index if not exists planning_start_idx on public.planning (start_iso);
create index if not exists planning_teamlid_idx on public.planning (lower(teamlid));
create index if not exists planning_locatie_idx on public.planning (lower(locatie));
create index if not exists planning_diensttype_idx on public.planning (diensttype);
create index if not exists planning_archived_idx on public.planning (archived);

drop trigger if exists trg_planning_set_modified on public.planning;
create trigger trg_planning_set_modified
  before update on public.planning
  for each row execute function public.set_laatst_gewijzigd();

alter table public.planning enable row level security;

drop policy if exists "anon kan planning lezen" on public.planning;
create policy "anon kan planning lezen"
  on public.planning for select to anon using (true);

drop policy if exists "anon kan planning toevoegen" on public.planning;
create policy "anon kan planning toevoegen"
  on public.planning for insert to anon with check (true);

drop policy if exists "anon kan planning bewerken" on public.planning;
create policy "anon kan planning bewerken"
  on public.planning for update to anon using (true) with check (true);

drop policy if exists "anon kan planning verwijderen" on public.planning;
create policy "anon kan planning verwijderen"
  on public.planning for delete to anon using (true);

-- TOEKOMSTIGE policies (na login):
-- create policy "ingelogd kan planning lezen"
--   on public.planning for select to authenticated using (true);
-- create policy "ingelogd kan planning toevoegen"
--   on public.planning for insert to authenticated with check (true);
-- create policy "ingelogd kan planning bewerken"
--   on public.planning for update to authenticated using (true) with check (true);
-- create policy "ingelogd kan planning verwijderen"
--   on public.planning for delete to authenticated using (true);

-- Geen seed-data: planning-items worden door de gebruiker aangemaakt.
-- Demo-data uit planning.js (oude prototype-seed) wordt eenmalig naar Supabase
-- gemigreerd door planning-data.js bij eerste page-load.

-- ============================================================================
-- comp_diensttypes (Compensatie module ? config per diensttype)
-- ============================================================================
create table if not exists public.comp_diensttypes (
  id text primary key,
  diensttype text not null,
  basis numeric(8,2) not null default 0,
  overuren numeric(8,2) not null default 0,
  regels text not null default 'full_time_only',
  teams jsonb not null default '[]'::jsonb,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists comp_diensttypes_dt_idx on public.comp_diensttypes (diensttype);

drop trigger if exists trg_comp_diensttypes_set_modified on public.comp_diensttypes;
create trigger trg_comp_diensttypes_set_modified
  before update on public.comp_diensttypes
  for each row execute function public.set_laatst_gewijzigd();

alter table public.comp_diensttypes enable row level security;

drop policy if exists "anon kan comp_diensttypes lezen" on public.comp_diensttypes;
create policy "anon kan comp_diensttypes lezen"
  on public.comp_diensttypes for select to anon using (true);
drop policy if exists "anon kan comp_diensttypes toevoegen" on public.comp_diensttypes;
create policy "anon kan comp_diensttypes toevoegen"
  on public.comp_diensttypes for insert to anon with check (true);
drop policy if exists "anon kan comp_diensttypes bewerken" on public.comp_diensttypes;
create policy "anon kan comp_diensttypes bewerken"
  on public.comp_diensttypes for update to anon using (true) with check (true);
drop policy if exists "anon kan comp_diensttypes verwijderen" on public.comp_diensttypes;
create policy "anon kan comp_diensttypes verwijderen"
  on public.comp_diensttypes for delete to anon using (true);

-- ============================================================================
-- comp_feestdagen (Compensatie module ? feestdagen + tarief multiplier)
-- ============================================================================
create table if not exists public.comp_feestdagen (
  id text primary key,
  naam text not null,
  datum_ts bigint not null,
  tarief numeric(6,2) not null default 1,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists comp_feestdagen_datum_idx on public.comp_feestdagen (datum_ts);

drop trigger if exists trg_comp_feestdagen_set_modified on public.comp_feestdagen;
create trigger trg_comp_feestdagen_set_modified
  before update on public.comp_feestdagen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.comp_feestdagen enable row level security;

drop policy if exists "anon kan comp_feestdagen lezen" on public.comp_feestdagen;
create policy "anon kan comp_feestdagen lezen"
  on public.comp_feestdagen for select to anon using (true);
drop policy if exists "anon kan comp_feestdagen toevoegen" on public.comp_feestdagen;
create policy "anon kan comp_feestdagen toevoegen"
  on public.comp_feestdagen for insert to anon with check (true);
drop policy if exists "anon kan comp_feestdagen bewerken" on public.comp_feestdagen;
create policy "anon kan comp_feestdagen bewerken"
  on public.comp_feestdagen for update to anon using (true) with check (true);
drop policy if exists "anon kan comp_feestdagen verwijderen" on public.comp_feestdagen;
create policy "anon kan comp_feestdagen verwijderen"
  on public.comp_feestdagen for delete to anon using (true);

-- Standaard feestdagen 2026 (NL). datum_ts in milliseconden vanaf epoch (UTC).
-- Datums zijn lokaal Nederland: gebruik 12:00 lokaal Europe/Amsterdam zodat
-- DST-grenzen niet leiden tot een dag-shift.
insert into public.comp_feestdagen (id, naam, datum_ts, tarief)
values
  ('cf_0',  '1 april',           extract(epoch from timestamp '2026-01-01 12:00')::bigint * 1000, 1.6),
  ('cf_1',  'Koningsdag',         extract(epoch from timestamp '2026-04-27 12:00')::bigint * 1000, 1.5),
  ('cf_2',  'Bevrijdingsdag',     extract(epoch from timestamp '2026-05-05 12:00')::bigint * 1000, 1.5),
  ('cf_3',  'Hemelvaart',         extract(epoch from timestamp '2026-05-14 12:00')::bigint * 1000, 1.6),
  ('cf_4',  'Pinksteren',         extract(epoch from timestamp '2026-05-24 12:00')::bigint * 1000, 1.6),
  ('cf_5',  'Eerste kerstdag',    extract(epoch from timestamp '2026-12-25 12:00')::bigint * 1000, 2.0),
  ('cf_6',  'Tweede kerstdag',    extract(epoch from timestamp '2026-12-26 12:00')::bigint * 1000, 2.0),
  ('cf_7',  'Nieuwjaar',          extract(epoch from timestamp '2027-01-01 12:00')::bigint * 1000, 2.0),
  ('cf_8',  'Goede vrijdag',      extract(epoch from timestamp '2026-04-03 12:00')::bigint * 1000, 1.5),
  ('cf_9',  'Pasen',              extract(epoch from timestamp '2026-04-05 12:00')::bigint * 1000, 1.6),
  ('cf_10', 'Tweede paasdag',     extract(epoch from timestamp '2026-04-06 12:00')::bigint * 1000, 1.6),
  ('cf_11', 'Prinsjesdag',        extract(epoch from timestamp '2026-09-15 12:00')::bigint * 1000, 1.0)
on conflict (id) do nothing;

-- ============================================================================
-- verzuim (HR module ? lange + korte verzuimdossiers in ??n tabel)
-- ============================================================================
create table if not exists public.verzuim (
  id text primary key,
  type text not null check (type in ('lang','kort')),
  medewerker text not null default '',
  eerst_ziektedag date,
  verwachte_terug date,
  werkelijke_terug date,
  beschrijving text not null default '',
  status text not null default 'Actief',
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists verzuim_type_idx on public.verzuim (type);
create index if not exists verzuim_status_idx on public.verzuim (status);

drop trigger if exists trg_verzuim_set_modified on public.verzuim;
create trigger trg_verzuim_set_modified
  before update on public.verzuim
  for each row execute function public.set_laatst_gewijzigd();

alter table public.verzuim enable row level security;

drop policy if exists "anon kan verzuim lezen" on public.verzuim;
create policy "anon kan verzuim lezen"
  on public.verzuim for select to anon using (true);
drop policy if exists "anon kan verzuim toevoegen" on public.verzuim;
create policy "anon kan verzuim toevoegen"
  on public.verzuim for insert to anon with check (true);
drop policy if exists "anon kan verzuim bewerken" on public.verzuim;
create policy "anon kan verzuim bewerken"
  on public.verzuim for update to anon using (true) with check (true);
drop policy if exists "anon kan verzuim verwijderen" on public.verzuim;
create policy "anon kan verzuim verwijderen"
  on public.verzuim for delete to anon using (true);

-- Standaard verzuim-dossiers (3 lang + 2 kort). Idempotent op id.
insert into public.verzuim (id, type, medewerker, eerst_ziektedag, verwachte_terug, werkelijke_terug, beschrijving, status)
values
  ('vz_l_1', 'lang', 'Sophie de Vries',  '2025-10-14', '2026-04-01', null,         'Langdurige ziekmelding ? traject begeleiding', 'Actief'),
  ('vz_l_2', 'lang', 'Thomas Bakker',    '2025-12-02', '2026-06-15', null,         'Re-integratie in voorbereiding',                'Actief'),
  ('vz_l_3', 'lang', 'Marieke Jansen',   '2026-01-08', '2026-03-20', '2026-02-28', 'Hersteld na specialistisch consult',            'Hersteld'),
  ('vz_k_1', 'kort', 'Daan Visser',      '2026-03-02', '2026-03-09', '2026-03-08', 'Griep',                                          'Hersteld'),
  ('vz_k_2', 'kort', 'Emma Smit',        '2026-03-18', '2026-03-25', null,         'Mag klachten',                                   'Actief')
on conflict (id) do nothing;

-- ============================================================================
-- salarisschalen (Salarishuis ? schalen + tredes als jsonb)
-- ============================================================================
create table if not exists public.salarisschalen (
  id text primary key,
  title text not null,
  rows jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists salarisschalen_sort_idx on public.salarisschalen (sort_order);

drop trigger if exists trg_salarisschalen_set_modified on public.salarisschalen;
create trigger trg_salarisschalen_set_modified
  before update on public.salarisschalen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.salarisschalen enable row level security;

drop policy if exists "anon kan salarisschalen lezen" on public.salarisschalen;
create policy "anon kan salarisschalen lezen"
  on public.salarisschalen for select to anon using (true);
drop policy if exists "anon kan salarisschalen toevoegen" on public.salarisschalen;
create policy "anon kan salarisschalen toevoegen"
  on public.salarisschalen for insert to anon with check (true);
drop policy if exists "anon kan salarisschalen bewerken" on public.salarisschalen;
create policy "anon kan salarisschalen bewerken"
  on public.salarisschalen for update to anon using (true) with check (true);
drop policy if exists "anon kan salarisschalen verwijderen" on public.salarisschalen;
create policy "anon kan salarisschalen verwijderen"
  on public.salarisschalen for delete to anon using (true);

-- Standaard salarisschalen (12 schalen + stagevergoeding). Volledige tredes
-- worden in jsonb opgeslagen zodat de structuur zonder schemawijziging kan
-- evolueren. Idempotent op id.
insert into public.salarisschalen (id, title, sort_order, rows)
values
  ('schaal-4', 'Schaal 4', 10, '[
    {"trede":"0","bedrag":"? 2.454,54"},{"trede":"1","bedrag":"? 2.454,54"},{"trede":"2","bedrag":"? 2.509,64"},{"trede":"3","bedrag":"? 2.588,84"},{"trede":"4","bedrag":"? 2.670,38"},
    {"trede":"5","bedrag":"? 2.754,21"},{"trede":"6","bedrag":"? 2.841,09"},{"trede":"7","bedrag":"? 2.930,26"},{"trede":"8","bedrag":"? 3.023,29"},{"trede":"9","bedrag":"? 3.118,51"},
    {"trede":"10","bedrag":"? 3.216,05"}
  ]'::jsonb),
  ('schaal-5', 'Schaal 5', 20, '[
    {"trede":"0","bedrag":"? 2.454,54"},{"trede":"1","bedrag":"? 2.520,27"},{"trede":"2","bedrag":"? 2.600,30"},{"trede":"3","bedrag":"? 2.684,12"},{"trede":"4","bedrag":"? 2.769,51"},
    {"trede":"5","bedrag":"? 2.858,62"},{"trede":"6","bedrag":"? 2.950,10"},{"trede":"7","bedrag":"? 3.043,85"},{"trede":"8","bedrag":"? 3.141,40"},{"trede":"9","bedrag":"? 3.241,97"},
    {"trede":"10","bedrag":"? 3.345,66"},{"trede":"11","bedrag":"? 3.453,06"}
  ]'::jsonb),
  ('schaal-6', 'Schaal 6', 30, '[
    {"trede":"0","bedrag":"? 2.618,60"},{"trede":"1","bedrag":"? 2.703,91"},{"trede":"2","bedrag":"? 2.791,59"},{"trede":"3","bedrag":"? 2.882,29"},{"trede":"4","bedrag":"? 2.976,00"},
    {"trede":"5","bedrag":"? 3.072,76"},{"trede":"6","bedrag":"? 3.172,64"},{"trede":"7","bedrag":"? 3.275,51"},{"trede":"8","bedrag":"? 3.382,21"},{"trede":"9","bedrag":"? 3.491,92"},
    {"trede":"10","bedrag":"? 3.605,49"},{"trede":"11","bedrag":"? 3.722,88"}
  ]'::jsonb),
  ('schaal-7', 'Schaal 7', 40, '[
    {"trede":"0","bedrag":"? 2.818,26"},{"trede":"1","bedrag":"? 2.911,23"},{"trede":"2","bedrag":"? 3.007,25"},{"trede":"3","bedrag":"? 3.106,34"},{"trede":"4","bedrag":"? 3.209,22"},
    {"trede":"5","bedrag":"? 3.315,13"},{"trede":"6","bedrag":"? 3.424,11"},{"trede":"7","bedrag":"? 3.537,68"},{"trede":"8","bedrag":"? 3.654,29"},{"trede":"9","bedrag":"? 3.774,69"},
    {"trede":"10","bedrag":"? 3.898,93"},{"trede":"11","bedrag":"? 4.027,70"}
  ]'::jsonb),
  ('schaal-8', 'Schaal 8', 50, '[
    {"trede":"0","bedrag":"? 2.946,27"},{"trede":"1","bedrag":"? 3.045,34"},{"trede":"2","bedrag":"? 3.146,69"},{"trede":"3","bedrag":"? 3.252,63"},{"trede":"4","bedrag":"? 3.361,64"},
    {"trede":"5","bedrag":"? 3.473,65"},{"trede":"6","bedrag":"? 3.590,26"},{"trede":"7","bedrag":"? 3.710,67"},{"trede":"8","bedrag":"? 3.834,90"},{"trede":"9","bedrag":"? 3.963,67"},
    {"trede":"10","bedrag":"? 4.096,31"},{"trede":"11","bedrag":"? 4.233,47"},{"trede":"12","bedrag":"? 4.375,20"}
  ]'::jsonb),
  ('schaal-9', 'Schaal 9', 60, '[
    {"trede":"0","bedrag":"? 3.191,69"},{"trede":"1","bedrag":"? 3.299,91"},{"trede":"2","bedrag":"? 3.412,73"},{"trede":"3","bedrag":"? 3.528,53"},{"trede":"4","bedrag":"? 3.648,19"},
    {"trede":"5","bedrag":"? 3.772,40"},{"trede":"6","bedrag":"? 3.900,42"},{"trede":"7","bedrag":"? 4.033,05"},{"trede":"8","bedrag":"? 4.170,21"},{"trede":"9","bedrag":"? 4.311,95"},
    {"trede":"10","bedrag":"? 4.459,04"},{"trede":"11","bedrag":"? 4.610,72"},{"trede":"12","bedrag":"? 4.766,96"}
  ]'::jsonb),
  ('schaal-10', 'Schaal 10', 70, '[
    {"trede":"0","bedrag":"? 3.472,90"},{"trede":"1","bedrag":"? 3.592,54"},{"trede":"2","bedrag":"? 3.716,79"},{"trede":"3","bedrag":"? 3.844,80"},{"trede":"4","bedrag":"? 3.977,44"},
    {"trede":"5","bedrag":"? 4.114,59"},{"trede":"6","bedrag":"? 4.256,32"},{"trede":"7","bedrag":"? 4.403,42"},{"trede":"8","bedrag":"? 4.555,85"},{"trede":"9","bedrag":"? 4.712,83"},
    {"trede":"10","bedrag":"? 4.875,16"},{"trede":"11","bedrag":"? 5.043,59"},{"trede":"12","bedrag":"? 5.217,35"}
  ]'::jsonb),
  ('schaal-11', 'Schaal 11', 80, '[
    {"trede":"0","bedrag":"? 3.972,06"},{"trede":"1","bedrag":"? 4.111,55"},{"trede":"2","bedrag":"? 4.255,60"},{"trede":"3","bedrag":"? 4.404,19"},{"trede":"4","bedrag":"? 4.558,15"},
    {"trede":"5","bedrag":"? 4.718,16"},{"trede":"6","bedrag":"? 4.882,77"},{"trede":"7","bedrag":"? 5.053,50"},{"trede":"8","bedrag":"? 5.231,05"},{"trede":"9","bedrag":"? 5.413,97"},
    {"trede":"10","bedrag":"? 5.602,97"},{"trede":"11","bedrag":"? 5.598,06"},{"trede":"12","bedrag":"? 6.002,30"}
  ]'::jsonb),
  ('schaal-12', 'Schaal 12', 90, '[
    {"trede":"0","bedrag":"? 4.375,20"},{"trede":"1","bedrag":"? 4.530,68"},{"trede":"2","bedrag":"? 4.691,50"},{"trede":"3","bedrag":"? 4.857,61"},{"trede":"4","bedrag":"? 5.030,63"},
    {"trede":"5","bedrag":"? 5.208,98"},{"trede":"6","bedrag":"? 5.394,16"},{"trede":"7","bedrag":"? 5.585,48"},{"trede":"8","bedrag":"? 5.783,60"},{"trede":"9","bedrag":"? 5.988,60"},
    {"trede":"10","bedrag":"? 6.201,23"},{"trede":"11","bedrag":"? 6.421,44"},{"trede":"12","bedrag":"? 6.649,31"},{"trede":"13","bedrag":"? 6.885,58"},
    {"trede":"Omvangperiodiek 1","bedrag":"? 7.130,22"},{"trede":"Omvangperiodiek 2","bedrag":"? 7.383,22"}
  ]'::jsonb),
  ('stagevergoeding', 'stagevergoeding', 100, '[{"trede":"Stagevergoeding","bedrag":"? 450,00"}]'::jsonb),
  ('schaal-13', 'Schaal 13', 110, '[
    {"trede":"0","bedrag":"? 4.987,95"},{"trede":"1","bedrag":"? 5.167,82"},{"trede":"2","bedrag":"? 5.353,78"},{"trede":"3","bedrag":"? 5.546,58"},{"trede":"4","bedrag":"? 5.746,23"},
    {"trede":"5","bedrag":"? 5.952,77"},{"trede":"6","bedrag":"? 6.166,91"},{"trede":"7","bedrag":"? 6.389,46"},{"trede":"8","bedrag":"? 6.618,85"},{"trede":"9","bedrag":"? 6.857,39"},
    {"trede":"10","bedrag":"? 7.104,33"},{"trede":"11","bedrag":"? 7.360,37"},{"trede":"12","bedrag":"? 7.624,85"}
  ]'::jsonb),
  ('schaal-14', 'Schaal 14', 120, '[
    {"trede":"0","bedrag":"? 6.250,00"},{"trede":"1","bedrag":"? 6.477,84"},{"trede":"2","bedrag":"? 6.714,89"},{"trede":"3","bedrag":"? 6.959,49"},{"trede":"4","bedrag":"? 7.214,04"}
  ]'::jsonb)
on conflict (id) do nothing;

-- ============================================================================
-- salarishuis_wijzigingen (Salarishuis ? audit log)
-- ============================================================================
create table if not exists public.salarishuis_wijzigingen (
  id uuid primary key default gen_random_uuid(),
  ts bigint not null,
  actie text not null default '',
  detail text not null default '',
  aanmaakdatum timestamptz not null default now()
);

create index if not exists salarishuis_wijzigingen_ts_idx on public.salarishuis_wijzigingen (ts desc);

alter table public.salarishuis_wijzigingen enable row level security;

drop policy if exists "anon kan salarishuis_wijzigingen lezen" on public.salarishuis_wijzigingen;
create policy "anon kan salarishuis_wijzigingen lezen"
  on public.salarishuis_wijzigingen for select to anon using (true);
drop policy if exists "anon kan salarishuis_wijzigingen toevoegen" on public.salarishuis_wijzigingen;
create policy "anon kan salarishuis_wijzigingen toevoegen"
  on public.salarishuis_wijzigingen for insert to anon with check (true);
drop policy if exists "anon kan salarishuis_wijzigingen verwijderen" on public.salarishuis_wijzigingen;
create policy "anon kan salarishuis_wijzigingen verwijderen"
  on public.salarishuis_wijzigingen for delete to anon using (true);

-- ============================================================================
-- saladmin_export_history (Salarisadministratie ? export log)
-- ============================================================================
create table if not exists public.saladmin_export_history (
  id text primary key,
  created_at timestamptz not null default now(),
  period text not null default '',
  employees integer not null default 0,
  by_name text not null default '',
  csv text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists saladmin_export_history_created_idx on public.saladmin_export_history (created_at desc);

drop trigger if exists trg_saladmin_export_history_set_modified on public.saladmin_export_history;
create trigger trg_saladmin_export_history_set_modified
  before update on public.saladmin_export_history
  for each row execute function public.set_laatst_gewijzigd();

alter table public.saladmin_export_history enable row level security;

drop policy if exists "anon kan saladmin_export_history lezen" on public.saladmin_export_history;
create policy "anon kan saladmin_export_history lezen"
  on public.saladmin_export_history for select to anon using (true);
drop policy if exists "anon kan saladmin_export_history toevoegen" on public.saladmin_export_history;
create policy "anon kan saladmin_export_history toevoegen"
  on public.saladmin_export_history for insert to anon with check (true);
drop policy if exists "anon kan saladmin_export_history bewerken" on public.saladmin_export_history;
create policy "anon kan saladmin_export_history bewerken"
  on public.saladmin_export_history for update to anon using (true) with check (true);
drop policy if exists "anon kan saladmin_export_history verwijderen" on public.saladmin_export_history;
create policy "anon kan saladmin_export_history verwijderen"
  on public.saladmin_export_history for delete to anon using (true);

insert into public.saladmin_export_history (id, created_at, period, employees, by_name, csv)
values
  ('seed_1', '2026-03-11T10:10:00Z'::timestamptz, 'Maart 2026',    31, 'Vennie K?ster', null),
  ('seed_2', '2026-03-18T10:10:00Z'::timestamptz, 'Februari 2026', 31, 'Vennie K?ster', null),
  ('seed_3', '2026-02-15T10:10:00Z'::timestamptz, 'Januari 2026',  33, 'Artem Fetchoj', null)
on conflict (id) do nothing;

-- ============================================================================
-- saladmin_ort (Salarisadministratie ? ORT-regels per jaar)
-- ============================================================================
create table if not exists public.saladmin_ort (
  jaar integer primary key,
  data jsonb not null default '{}'::jsonb,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

drop trigger if exists trg_saladmin_ort_set_modified on public.saladmin_ort;
create trigger trg_saladmin_ort_set_modified
  before update on public.saladmin_ort
  for each row execute function public.set_laatst_gewijzigd();

alter table public.saladmin_ort enable row level security;

drop policy if exists "anon kan saladmin_ort lezen" on public.saladmin_ort;
create policy "anon kan saladmin_ort lezen"
  on public.saladmin_ort for select to anon using (true);
drop policy if exists "anon kan saladmin_ort toevoegen" on public.saladmin_ort;
create policy "anon kan saladmin_ort toevoegen"
  on public.saladmin_ort for insert to anon with check (true);
drop policy if exists "anon kan saladmin_ort bewerken" on public.saladmin_ort;
create policy "anon kan saladmin_ort bewerken"
  on public.saladmin_ort for update to anon using (true) with check (true);
drop policy if exists "anon kan saladmin_ort verwijderen" on public.saladmin_ort;
create policy "anon kan saladmin_ort verwijderen"
  on public.saladmin_ort for delete to anon using (true);


-- ============================================================================
-- comp_saldi (Compensatie module ? saldi per medewerker)
-- ============================================================================
create table if not exists public.comp_saldi (
  id text primary key,
  medewerker text not null default '',
  team text not null default '',
  verdiend numeric(10,2) not null default 0,
  gebruikt numeric(10,2) not null default 0,
  saldo numeric(10,2) not null default 0,
  geschiktheid_label text not null default '',
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists comp_saldi_team_idx on public.comp_saldi (team);

drop trigger if exists trg_comp_saldi_set_modified on public.comp_saldi;
create trigger trg_comp_saldi_set_modified
  before update on public.comp_saldi
  for each row execute function public.set_laatst_gewijzigd();

alter table public.comp_saldi enable row level security;

drop policy if exists "anon kan comp_saldi lezen" on public.comp_saldi;
create policy "anon kan comp_saldi lezen"
  on public.comp_saldi for select to anon using (true);
drop policy if exists "anon kan comp_saldi toevoegen" on public.comp_saldi;
create policy "anon kan comp_saldi toevoegen"
  on public.comp_saldi for insert to anon with check (true);
drop policy if exists "anon kan comp_saldi bewerken" on public.comp_saldi;
create policy "anon kan comp_saldi bewerken"
  on public.comp_saldi for update to anon using (true) with check (true);
drop policy if exists "anon kan comp_saldi verwijderen" on public.comp_saldi;
create policy "anon kan comp_saldi verwijderen"
  on public.comp_saldi for delete to anon using (true);

-- ============================================================================
-- comp_berekeningen (Compensatie module ? berekenings-records per dag)
-- ============================================================================
create table if not exists public.comp_berekeningen (
  id text primary key,
  datum_ts bigint not null,
  medewerker text not null default '',
  contract_u integer not null default 0,
  gepland_u integer not null default 0,
  compensatie_min integer not null default 0,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists comp_berekeningen_datum_idx on public.comp_berekeningen (datum_ts);
create index if not exists comp_berekeningen_medewerker_idx on public.comp_berekeningen (lower(medewerker));

drop trigger if exists trg_comp_berekeningen_set_modified on public.comp_berekeningen;
create trigger trg_comp_berekeningen_set_modified
  before update on public.comp_berekeningen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.comp_berekeningen enable row level security;

drop policy if exists "anon kan comp_berekeningen lezen" on public.comp_berekeningen;
create policy "anon kan comp_berekeningen lezen"
  on public.comp_berekeningen for select to anon using (true);
drop policy if exists "anon kan comp_berekeningen toevoegen" on public.comp_berekeningen;
create policy "anon kan comp_berekeningen toevoegen"
  on public.comp_berekeningen for insert to anon with check (true);
drop policy if exists "anon kan comp_berekeningen bewerken" on public.comp_berekeningen;
create policy "anon kan comp_berekeningen bewerken"
  on public.comp_berekeningen for update to anon using (true) with check (true);
drop policy if exists "anon kan comp_berekeningen verwijderen" on public.comp_berekeningen;
create policy "anon kan comp_berekeningen verwijderen"
  on public.comp_berekeningen for delete to anon using (true);

-- 81 demo-records voor comp_saldi (gegenereerd uit hash01)
insert into public.comp_saldi (id, medewerker, team, verdiend, gebruikt, saldo, geschiktheid_label)
values
  ('cs_0', 'Adriana Malovan', 'Voorburggracht', 41.95, 8.48, 34.49, ''),
  ('cs_1', 'Nick Malovan', 'Centrum', 111.81, 94.83, 14.86, 'Ontvangt compensatie uren'),
  ('cs_2', 'Marieke Malovan', 'Noord', 93.73, 58.56, 33.64, 'Ontvangt compensatie uren'),
  ('cs_3', 'Thomas van Harskamp', 'Zuid', 83.57, 64.48, 20.21, 'Ontvangt compensatie uren'),
  ('cs_4', 'Sophie van Harskamp', 'Oost', 64.69, 50.85, 7.67, ''),
  ('cs_5', 'Lars van Harskamp', 'West', 133.81, 4.94, 131.10, 'Ontvangt compensatie uren'),
  ('cs_6', 'Emma Jansen', 'Zorgteam A', 128.34, 69.51, 66.20, 'Ontvangt compensatie uren'),
  ('cs_7', 'Daan Jansen', 'Zorgteam B', 80.45, 65.84, 10.59, 'Ontvangt compensatie uren'),
  ('cs_8', 'Lisa Jansen', 'Voorburggracht', 85.81, 19.64, 62.36, ''),
  ('cs_9', 'Noah de Vries', 'Centrum', 88.61, 61.68, 31.45, 'Ontvangt compensatie uren'),
  ('cs_10', 'Julia de Vries', 'Noord', 31.39, 4.13, 32.92, 'Ontvangt compensatie uren'),
  ('cs_11', 'Finn de Vries', 'Zuid', 103.08, 80.90, 24.42, 'Ontvangt compensatie uren'),
  ('cs_12', 'Eva Bakker', 'Oost', 108.33, 18.39, 83.22, ''),
  ('cs_13', 'Sam Bakker', 'West', 86.16, 28.17, 57.96, 'Ontvangt compensatie uren'),
  ('cs_14', 'Iris Bakker', 'Zorgteam A', 121.89, 62.40, 64.43, 'Ontvangt compensatie uren'),
  ('cs_15', 'Bas Visser', 'Zorgteam B', 63.90, 19.97, 47.74, 'Ontvangt compensatie uren'),
  ('cs_16', 'Nina Visser', 'Voorburggracht', 76.69, 27.36, 42.75, ''),
  ('cs_17', 'Tim Visser', 'Centrum', 57.54, 29.89, 26.58, 'Ontvangt compensatie uren'),
  ('cs_18', 'Lotte Smit', 'Noord', 150.48, 17.66, 140.58, 'Ontvangt compensatie uren'),
  ('cs_19', 'Ruben Smit', 'Zuid', 120.20, 69.35, 57.37, 'Ontvangt compensatie uren'),
  ('cs_20', 'Anna Smit', 'Oost', 141.87, 115.85, 25.72, ''),
  ('cs_21', 'Jesse Mulder', 'West', 122.24, 26.85, 93.01, 'Ontvangt compensatie uren'),
  ('cs_22', 'Mila Mulder', 'Zorgteam A', 28.21, 8.29, 19.78, 'Ontvangt compensatie uren'),
  ('cs_23', 'Luuk Mulder', 'Zorgteam B', 101.37, 70.40, 24.20, 'Ontvangt compensatie uren'),
  ('cs_24', 'Fleur de Boer', 'Voorburggracht', 141.02, 106.37, 41.22, ''),
  ('cs_25', 'Max de Boer', 'Centrum', 59.38, 32.29, 23.79, 'Ontvangt compensatie uren'),
  ('cs_26', 'Sanne de Boer', 'Noord', 126.90, 9.63, 114.73, 'Ontvangt compensatie uren'),
  ('cs_27', 'Koen Kok', 'Zuid', 56.58, 25.95, 32.50, 'Ontvangt compensatie uren'),
  ('cs_28', 'Roos Kok', 'Oost', 129.43, 91.97, 38.97, ''),
  ('cs_29', 'Stijn Kok', 'West', 44.36, 31.84, 12.74, 'Ontvangt compensatie uren'),
  ('cs_30', 'Adriana Dijkstra 31', 'Zorgteam A', 67.24, 5.06, 58.72, 'Ontvangt compensatie uren'),
  ('cs_31', 'Nick Dijkstra 32', 'Zorgteam B', 96.64, 36.59, 67.09, 'Ontvangt compensatie uren'),
  ('cs_32', 'Marieke Dijkstra 33', 'Voorburggracht', 76.13, 65.75, 17.67, ''),
  ('cs_33', 'Thomas Janssen 34', 'Centrum', 83.52, 67.44, 10.31, 'Ontvangt compensatie uren'),
  ('cs_34', 'Sophie Janssen 35', 'Noord', 106.42, 47.55, 62.06, 'Ontvangt compensatie uren'),
  ('cs_35', 'Lars Janssen 36', 'Zuid', 33.75, 10.07, 16.99, 'Ontvangt compensatie uren'),
  ('cs_36', 'Emma van Dijk 37', 'Oost', 99.76, 42.64, 64.92, ''),
  ('cs_37', 'Daan van Dijk 38', 'West', 141.28, 11.20, 130.58, 'Ontvangt compensatie uren'),
  ('cs_38', 'Lisa van Dijk 39', 'Zorgteam A', 58.86, 48.55, 8.71, 'Ontvangt compensatie uren'),
  ('cs_39', 'Noah Berg 40', 'Zorgteam B', 63.46, 19.85, 45.17, 'Ontvangt compensatie uren'),
  ('cs_40', 'Julia Berg 41', 'Voorburggracht', 128.87, 37.37, 90.66, ''),
  ('cs_41', 'Finn Berg 42', 'Centrum', 140.48, 74.64, 65.27, 'Ontvangt compensatie uren'),
  ('cs_42', 'Eva Hendriks 43', 'Noord', 96.78, 50.91, 37.95, 'Ontvangt compensatie uren'),
  ('cs_43', 'Sam Hendriks 44', 'Zuid', 32.60, 17.23, 19.03, 'Ontvangt compensatie uren'),
  ('cs_44', 'Iris Hendriks 45', 'Oost', 85.76, 24.66, 58.43, ''),
  ('cs_45', 'Bas van den Berg 46', 'West', 126.04, 100.73, 21.08, 'Ontvangt compensatie uren'),
  ('cs_46', 'Nina van den Berg 47', 'Zorgteam A', 120.61, 98.97, 26.75, 'Ontvangt compensatie uren'),
  ('cs_47', 'Tim van den Berg 48', 'Zorgteam B', 45.62, 7.41, 45.89, 'Ontvangt compensatie uren'),
  ('cs_48', 'Lotte Scholten 49', 'Voorburggracht', 89.98, 56.49, 29.79, ''),
  ('cs_49', 'Ruben Scholten 50', 'Centrum', 138.23, 13.60, 118.03, 'Ontvangt compensatie uren'),
  ('cs_50', 'Anna Scholten 51', 'Noord', 131.92, 110.72, 21.69, 'Ontvangt compensatie uren'),
  ('cs_51', 'Jesse Meijer 52', 'Zuid', 83.78, 38.85, 43.00, 'Ontvangt compensatie uren'),
  ('cs_52', 'Mila Meijer 53', 'Oost', 71.14, 26.18, 47.89, ''),
  ('cs_53', 'Luuk Meijer 54', 'West', 90.92, 49.17, 45.99, 'Ontvangt compensatie uren'),
  ('cs_54', 'Fleur van Leeuwen 55', 'Zorgteam A', 44.19, 20.80, 25.34, 'Ontvangt compensatie uren'),
  ('cs_55', 'Max van Leeuwen 56', 'Zorgteam B', 147.25, 58.09, 90.98, 'Ontvangt compensatie uren'),
  ('cs_56', 'Sanne van Leeuwen 57', 'Voorburggracht', 55.25, 1.22, 48.11, ''),
  ('cs_57', 'Koen Willems 58', 'Centrum', 63.94, 41.62, 21.66, 'Ontvangt compensatie uren'),
  ('cs_58', 'Roos Willems 59', 'Noord', 100.01, 31.32, 70.00, 'Ontvangt compensatie uren'),
  ('cs_59', 'Stijn Willems 60', 'Zuid', 100.35, 24.12, 71.01, 'Ontvangt compensatie uren'),
  ('cs_60', 'Adriana Postma 61', 'Oost', 93.64, 65.24, 24.75, ''),
  ('cs_61', 'Nick Postma 62', 'West', 69.01, 58.49, 17.47, 'Ontvangt compensatie uren'),
  ('cs_62', 'Marieke Postma 63', 'Zorgteam A', 150.82, 36.43, 116.29, 'Ontvangt compensatie uren'),
  ('cs_63', 'Thomas Kramer 64', 'Zorgteam B', 134.67, 12.98, 124.29, 'Ontvangt compensatie uren'),
  ('cs_64', 'Sophie Kramer 65', 'Voorburggracht', 39.74, 21.93, 23.28, ''),
  ('cs_65', 'Lars Kramer 66', 'Centrum', 109.93, 35.46, 72.17, 'Ontvangt compensatie uren'),
  ('cs_66', 'Emma van der Laan 67', 'Noord', 38.80, 23.53, 20.69, 'Ontvangt compensatie uren'),
  ('cs_67', 'Daan van der Laan 68', 'Zuid', 150.48, 99.86, 49.96, 'Ontvangt compensatie uren'),
  ('cs_68', 'Lisa van der Laan 69', 'Oost', 98.78, 55.20, 39.87, ''),
  ('cs_69', 'Noah Hoekstra 70', 'West', 85.99, 48.87, 38.54, 'Ontvangt compensatie uren'),
  ('cs_70', 'Julia Hoekstra 71', 'Zorgteam A', 91.69, 10.11, 74.20, 'Ontvangt compensatie uren'),
  ('cs_71', 'Finn Hoekstra 72', 'Zorgteam B', 76.66, 30.87, 43.47, 'Ontvangt compensatie uren'),
  ('cs_72', 'Eva Blom 73', 'Voorburggracht', 81.70, 42.40, 45.40, ''),
  ('cs_73', 'Sam Blom 74', 'Centrum', 29.57, 7.37, 17.29, 'Ontvangt compensatie uren'),
  ('cs_74', 'Iris Blom 75', 'Noord', 119.48, 31.64, 94.40, 'Ontvangt compensatie uren'),
  ('cs_75', 'Bas Peeters 76', 'Zuid', 74.98, 59.54, 17.83, 'Ontvangt compensatie uren'),
  ('cs_76', 'Nina Peeters 77', 'Oost', 66.30, 35.86, 34.59, ''),
  ('cs_77', 'Tim Peeters 78', 'West', 118.36, 68.67, 42.77, 'Ontvangt compensatie uren'),
  ('cs_78', 'Lotte de Graaf 79', 'Zorgteam A', 140.61, 103.61, 39.80, 'Ontvangt compensatie uren'),
  ('cs_79', 'Ruben de Graaf 80', 'Zorgteam B', 58.23, 21.63, 43.64, 'Ontvangt compensatie uren'),
  ('cs_80', 'Anna de Graaf 81', 'Voorburggracht', 39.47, 28.15, 12.55, '')
on conflict (id) do nothing;

-- 52 demo-records voor comp_berekeningen (gegenereerd uit hash01)
insert into public.comp_berekeningen (id, datum_ts, medewerker, contract_u, gepland_u, compensatie_min)
values
  ('cb_0', 1735686000000, 'Tanja Koster', 24, 0, 939),
  ('cb_1', 1735689600000, 'Adriana Malovan', 32, 24, 1126),
  ('cb_2', 1735779600000, 'Nick van Harskamp', 36, 20, -515),
  ('cb_3', 1735772400000, 'Marieke Jansen', 24, 11, 3104),
  ('cb_4', 1735862400000, 'Thomas de Vries', 32, 9, -926),
  ('cb_5', 1735866000000, 'Sophie Bakker', 36, 0, -236),
  ('cb_6', 1735945200000, 'Lars Visser', 24, 18, -1676),
  ('cb_7', 1735948800000, 'Emma Smit', 32, 16, 4098),
  ('cb_8', 1736038800000, 'Daan Mulder', 36, 19, 1917),
  ('cb_9', 1736031600000, 'Lisa de Boer', 24, 13, 3198),
  ('cb_10', 1736121600000, 'Noah Kok', 32, 0, 3127),
  ('cb_11', 1736125200000, 'Julia Dijkstra', 36, 21, -3304),
  ('cb_12', 1736204400000, 'Finn Janssen', 24, 15, 1409),
  ('cb_13', 1736208000000, 'Eva van Dijk', 32, 13, 3890),
  ('cb_14', 1736298000000, 'Sam Berg', 36, 31, -1975),
  ('cb_15', 1736290800000, 'Tanja Koster', 24, 0, 2364),
  ('cb_16', 1736380800000, 'Adriana Malovan', 32, 14, -2487),
  ('cb_17', 1736384400000, 'Nick van Harskamp', 36, 9, 3606),
  ('cb_18', 1736463600000, 'Marieke Jansen', 24, 24, -2228),
  ('cb_19', 1736467200000, 'Thomas de Vries', 32, 23, -865),
  ('cb_20', 1736557200000, 'Sophie Bakker', 36, 0, 931),
  ('cb_21', 1736550000000, 'Lars Visser', 24, 20, -858),
  ('cb_22', 1736640000000, 'Emma Smit', 32, 1, -528),
  ('cb_23', 1736643600000, 'Daan Mulder', 36, 23, 835),
  ('cb_24', 1736722800000, 'Lisa de Boer', 24, 22, -2772),
  ('cb_25', 1736726400000, 'Noah Kok', 32, 0, 1465),
  ('cb_26', 1736816400000, 'Julia Dijkstra', 36, 28, 4070),
  ('cb_27', 1736809200000, 'Finn Janssen', 24, 4, -1587),
  ('cb_28', 1736899200000, 'Eva van Dijk', 32, 29, -1703),
  ('cb_29', 1736902800000, 'Sam Berg', 36, 6, 2495),
  ('cb_30', 1736982000000, 'Tanja Koster', 24, 0, 3106),
  ('cb_31', 1736985600000, 'Adriana Malovan', 32, 18, 1430),
  ('cb_32', 1737075600000, 'Nick van Harskamp', 36, 13, -3012),
  ('cb_33', 1737068400000, 'Marieke Jansen', 24, 10, 369),
  ('cb_34', 1737158400000, 'Thomas de Vries', 32, 18, 2891),
  ('cb_35', 1737162000000, 'Sophie Bakker', 36, 0, 2107),
  ('cb_36', 1737241200000, 'Lars Visser', 24, 15, -3055),
  ('cb_37', 1737244800000, 'Emma Smit', 32, 31, -260),
  ('cb_38', 1737334800000, 'Daan Mulder', 36, 9, 4193),
  ('cb_39', 1737327600000, 'Lisa de Boer', 24, 6, 3610),
  ('cb_40', 1737417600000, 'Noah Kok', 32, 0, 237),
  ('cb_41', 1737421200000, 'Julia Dijkstra', 36, 31, -768),
  ('cb_42', 1737500400000, 'Finn Janssen', 24, 15, 128),
  ('cb_43', 1737504000000, 'Eva van Dijk', 32, 3, -3150),
  ('cb_44', 1737594000000, 'Sam Berg', 36, 18, 3557),
  ('cb_45', 1737586800000, 'Tanja Koster', 24, 0, -1339),
  ('cb_46', 1737676800000, 'Adriana Malovan', 32, 24, -923),
  ('cb_47', 1737680400000, 'Nick van Harskamp', 36, 3, 1319),
  ('cb_48', 1737759600000, 'Marieke Jansen', 24, 10, 1179),
  ('cb_49', 1737763200000, 'Thomas de Vries', 32, 32, 309),
  ('cb_50', 1737853200000, 'Sophie Bakker', 36, 0, -1495),
  ('cb_51', 1737846000000, 'Lars Visser', 24, 12, 3796)
on conflict (id) do nothing;

-- ============================================================================
-- urendeclaraties (Cli?nten module ? gedebiteerde/ingediende uren per maand)
-- ============================================================================
create table if not exists public.urendeclaraties (
  id text primary key,
  client text not null default '',
  maand_label text not null default '',
  beschikking text not null default '',
  zorgsoort text not null default '',
  jaar integer not null default 2026,
  maand integer not null default 0,
  uurtarief numeric(10,2) not null default 0,
  bedrag numeric(12,2) not null default 0,
  gedebiteerde_uren numeric(8,2) not null default 0,
  ingediende_uren numeric(8,2) not null default 0,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists urendeclaraties_client_idx on public.urendeclaraties (lower(client));
create index if not exists urendeclaraties_jaar_idx on public.urendeclaraties (jaar);
create index if not exists urendeclaraties_maand_idx on public.urendeclaraties (maand);
create index if not exists urendeclaraties_zorg_idx on public.urendeclaraties (zorgsoort);

drop trigger if exists trg_urendeclaraties_set_modified on public.urendeclaraties;
create trigger trg_urendeclaraties_set_modified
  before update on public.urendeclaraties
  for each row execute function public.set_laatst_gewijzigd();

alter table public.urendeclaraties enable row level security;

drop policy if exists "anon kan urendeclaraties lezen" on public.urendeclaraties;
create policy "anon kan urendeclaraties lezen"
  on public.urendeclaraties for select to anon using (true);
drop policy if exists "anon kan urendeclaraties toevoegen" on public.urendeclaraties;
create policy "anon kan urendeclaraties toevoegen"
  on public.urendeclaraties for insert to anon with check (true);
drop policy if exists "anon kan urendeclaraties bewerken" on public.urendeclaraties;
create policy "anon kan urendeclaraties bewerken"
  on public.urendeclaraties for update to anon using (true) with check (true);
drop policy if exists "anon kan urendeclaraties verwijderen" on public.urendeclaraties;
create policy "anon kan urendeclaraties verwijderen"
  on public.urendeclaraties for delete to anon using (true);

-- 7 seed-records (uit oude statische HTML van urendeclaraties.html)
insert into public.urendeclaraties (id, client, maand_label, beschikking, zorgsoort, jaar, maand, uurtarief, bedrag, gedebiteerde_uren, ingediende_uren)
values
  ('ud_1', 'Raymond Ader',    'April 2026',     'WIZ 14 u p week', 'WIZ',         2026, 3, 72.00,   0.00, 70, 0),
  ('ud_2', 'Dries Becker',    'April 2026',     'Ambulant',        'Ambulant',    2026, 3, 72.00,   0.00, 50, 0),
  ('ud_3', 'Lotte Janssen',   'Januari 2025',   'WIZ 8 u p week',  'WIZ',         2025, 0, 68.00, 120.00, 32, 28),
  ('ud_4', 'Bram Claes',      'April 2025',     'Ambulant',        'Ambulant',    2025, 3, 70.00,   0.00, 44, 0),
  ('ud_5', 'Eva Smit',        'Maart 2024',     'WIZ 12 u p week', 'WIZ',         2024, 2, 65.00,   0.00, 48, 12),
  ('ud_6', 'Finn Verlinden',  'September 2024', 'Ambulant',        'Ambulant',    2024, 8, 70.00,   0.00, 36, 0),
  ('ud_7', 'Greet Van Dam',   'Juni 2026',      'WIZ 6 u p week',  'WIZ',         2026, 5, 72.00,   0.00, 24, 0)
on conflict (id) do nothing;

-- ============================================================================
-- nieuws (HR / nieuwsoverzicht module)
-- ============================================================================
--
-- Vervangt de oude localStorage-only opslag onder key "newsItems". Bestaande
-- items worden eenmalig gemigreerd door nieuws-data.js bij eerste bezoek na
-- deploy.

create table if not exists public.nieuws (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  status text not null default 'Published',
  auteur text not null default 'HR team',
  inhoud text not null default '',
  image text,
  image2 text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists nieuws_archived_idx
  on public.nieuws (archived);

create index if not exists nieuws_aanmaakdatum_idx
  on public.nieuws (aanmaakdatum desc);

drop trigger if exists trg_nieuws_set_modified on public.nieuws;
create trigger trg_nieuws_set_modified
  before update on public.nieuws
  for each row execute function public.set_laatst_gewijzigd();

alter table public.nieuws enable row level security;

drop policy if exists "anon kan nieuws lezen" on public.nieuws;
create policy "anon kan nieuws lezen"
  on public.nieuws
  for select
  to anon
  using (true);

drop policy if exists "anon kan nieuws toevoegen" on public.nieuws;
create policy "anon kan nieuws toevoegen"
  on public.nieuws
  for insert
  to anon
  with check (true);

drop policy if exists "anon kan nieuws bewerken" on public.nieuws;
create policy "anon kan nieuws bewerken"
  on public.nieuws
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "anon kan nieuws verwijderen" on public.nieuws;
create policy "anon kan nieuws verwijderen"
  on public.nieuws
  for delete
  to anon
  using (true);

-- ============================================================================
-- beschikking_tarieven (sub-data per beschikking)
-- ============================================================================
--
-- Eén beschikking kan meerdere tarief-historie-rijen hebben. Elke rij heeft
-- een geldigheidsdatum, een weektarief en optioneel een reden (bv.
-- "Indexatie 2026"). beschikking_id is een soft-FK naar beschikkingen.id
-- (text), conform bestaand patroon — geen harde constraint zodat legacy-IDs
-- blijven werken.

create table if not exists public.beschikking_tarieven (
  id uuid primary key default gen_random_uuid(),
  beschikking_id text not null,
  geldig_van date not null,
  weektarief numeric(12, 2) not null default 0,
  reden text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists beschikking_tarieven_besc_idx
  on public.beschikking_tarieven (beschikking_id);

create index if not exists beschikking_tarieven_geldig_idx
  on public.beschikking_tarieven (geldig_van desc);

drop trigger if exists trg_beschikking_tarieven_set_modified on public.beschikking_tarieven;
create trigger trg_beschikking_tarieven_set_modified
  before update on public.beschikking_tarieven
  for each row execute function public.set_laatst_gewijzigd();

alter table public.beschikking_tarieven enable row level security;

drop policy if exists "anon kan beschikking_tarieven lezen" on public.beschikking_tarieven;
create policy "anon kan beschikking_tarieven lezen"
  on public.beschikking_tarieven for select to anon using (true);

drop policy if exists "anon kan beschikking_tarieven toevoegen" on public.beschikking_tarieven;
create policy "anon kan beschikking_tarieven toevoegen"
  on public.beschikking_tarieven for insert to anon with check (true);

drop policy if exists "anon kan beschikking_tarieven bewerken" on public.beschikking_tarieven;
create policy "anon kan beschikking_tarieven bewerken"
  on public.beschikking_tarieven for update to anon using (true) with check (true);

drop policy if exists "anon kan beschikking_tarieven verwijderen" on public.beschikking_tarieven;
create policy "anon kan beschikking_tarieven verwijderen"
  on public.beschikking_tarieven for delete to anon using (true);

-- ============================================================================
-- beschikking_notities (sub-data per beschikking)
-- ============================================================================
--
-- Vrije HTML-notities die HR-medewerkers per beschikking kunnen toevoegen.
-- Body is HTML uit de inline RTE. beschikking_id is soft-FK naar
-- beschikkingen.id (text).

create table if not exists public.beschikking_notities (
  id uuid primary key default gen_random_uuid(),
  beschikking_id text not null,
  body_html text not null default '',
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists beschikking_notities_besc_idx
  on public.beschikking_notities (beschikking_id);

create index if not exists beschikking_notities_aanmaak_idx
  on public.beschikking_notities (aanmaakdatum desc);

drop trigger if exists trg_beschikking_notities_set_modified on public.beschikking_notities;
create trigger trg_beschikking_notities_set_modified
  before update on public.beschikking_notities
  for each row execute function public.set_laatst_gewijzigd();

alter table public.beschikking_notities enable row level security;

drop policy if exists "anon kan beschikking_notities lezen" on public.beschikking_notities;
create policy "anon kan beschikking_notities lezen"
  on public.beschikking_notities for select to anon using (true);

drop policy if exists "anon kan beschikking_notities toevoegen" on public.beschikking_notities;
create policy "anon kan beschikking_notities toevoegen"
  on public.beschikking_notities for insert to anon with check (true);

drop policy if exists "anon kan beschikking_notities bewerken" on public.beschikking_notities;
create policy "anon kan beschikking_notities bewerken"
  on public.beschikking_notities for update to anon using (true) with check (true);

drop policy if exists "anon kan beschikking_notities verwijderen" on public.beschikking_notities;
create policy "anon kan beschikking_notities verwijderen"
  on public.beschikking_notities for delete to anon using (true);

-- ============================================================================
-- beschikking_audit_log (compliance: wie heeft wanneer wat met de beschikking
-- gedaan?)
-- ============================================================================
--
-- Append-only log met aanmaken / bekijken / bewerken events. Eén regel per
-- actie. beschikking_id is een soft-FK naar beschikkingen.id (text).
-- Bewerken / verwijderen van een audit-rij hoort eigenlijk niet — voor
-- demonstratie laten we update/delete via anon nog wel toe (consistent met
-- ander beleid).

create table if not exists public.beschikking_audit_log (
  id uuid primary key default gen_random_uuid(),
  beschikking_id text not null,
  t timestamptz not null default now(),
  act text not null check (act in ('aanmaken', 'bekijken', 'bewerken')),
  gebruiker text not null default 'Onbekend',
  details text,
  resource text not null default 'Beschikking',
  ip text,
  user_agent text,
  status text not null default 'succes',
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists beschikking_audit_log_besc_t_idx
  on public.beschikking_audit_log (beschikking_id, t desc);

create index if not exists beschikking_audit_log_act_idx
  on public.beschikking_audit_log (act);

drop trigger if exists trg_beschikking_audit_log_set_modified on public.beschikking_audit_log;
create trigger trg_beschikking_audit_log_set_modified
  before update on public.beschikking_audit_log
  for each row execute function public.set_laatst_gewijzigd();

alter table public.beschikking_audit_log enable row level security;

drop policy if exists "anon kan beschikking_audit_log lezen" on public.beschikking_audit_log;
create policy "anon kan beschikking_audit_log lezen"
  on public.beschikking_audit_log for select to anon using (true);

drop policy if exists "anon kan beschikking_audit_log toevoegen" on public.beschikking_audit_log;
create policy "anon kan beschikking_audit_log toevoegen"
  on public.beschikking_audit_log for insert to anon with check (true);

drop policy if exists "anon kan beschikking_audit_log bewerken" on public.beschikking_audit_log;
create policy "anon kan beschikking_audit_log bewerken"
  on public.beschikking_audit_log for update to anon using (true) with check (true);

drop policy if exists "anon kan beschikking_audit_log verwijderen" on public.beschikking_audit_log;
create policy "anon kan beschikking_audit_log verwijderen"
  on public.beschikking_audit_log for delete to anon using (true);

-- ============================================================================
-- medewerker_notities (vrije HTML-notities per medewerker, HR-only)
-- ============================================================================
--
-- 1-op-veel: één medewerker kan meerdere notities hebben. medewerker_id is
-- soft-FK naar medewerkers.id (text, want we accepteren ook legacy text-ids).
-- Body is HTML uit de inline RTE op de medewerker-detail-pagina.

create table if not exists public.medewerker_notities (
  id uuid primary key default gen_random_uuid(),
  medewerker_id text not null,
  body_html text not null default '',
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists medewerker_notities_emp_idx
  on public.medewerker_notities (medewerker_id);

create index if not exists medewerker_notities_aanmaak_idx
  on public.medewerker_notities (aanmaakdatum desc);

drop trigger if exists trg_medewerker_notities_set_modified on public.medewerker_notities;
create trigger trg_medewerker_notities_set_modified
  before update on public.medewerker_notities
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerker_notities enable row level security;

drop policy if exists "anon kan medewerker_notities lezen" on public.medewerker_notities;
create policy "anon kan medewerker_notities lezen"
  on public.medewerker_notities for select to anon using (true);

drop policy if exists "anon kan medewerker_notities toevoegen" on public.medewerker_notities;
create policy "anon kan medewerker_notities toevoegen"
  on public.medewerker_notities for insert to anon with check (true);

drop policy if exists "anon kan medewerker_notities bewerken" on public.medewerker_notities;
create policy "anon kan medewerker_notities bewerken"
  on public.medewerker_notities for update to anon using (true) with check (true);

drop policy if exists "anon kan medewerker_notities verwijderen" on public.medewerker_notities;
create policy "anon kan medewerker_notities verwijderen"
  on public.medewerker_notities for delete to anon using (true);

-- ============================================================================
-- medewerker_verlof_overgedragen (verlof-saldi van vorige jaargang)
-- ============================================================================
--
-- 1-op-1 met medewerker (UNIQUE constraint). Bevat overgedragen wettelijke
-- en bovenwettelijke verlofuren + een vrije reden-tekst. Wordt vanuit het
-- "Verlof overgedragen"-modal op de medewerker-detail-pagina opgeslagen.
-- medewerker_id is soft-FK naar medewerkers.id (text).

create table if not exists public.medewerker_verlof_overgedragen (
  id uuid primary key default gen_random_uuid(),
  medewerker_id text not null unique,
  wet_totaal numeric(8, 2) not null default 0,
  wet_gebruikt numeric(8, 2) not null default 0,
  wet_beschikbaar numeric(8, 2) not null default 0,
  bovenwet_totaal numeric(8, 2) not null default 0,
  bovenwet_gebruikt numeric(8, 2) not null default 0,
  bovenwet_beschikbaar numeric(8, 2) not null default 0,
  reden text,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists medewerker_verlof_overgedragen_emp_idx
  on public.medewerker_verlof_overgedragen (medewerker_id);

drop trigger if exists trg_medewerker_verlof_overgedragen_set_modified on public.medewerker_verlof_overgedragen;
create trigger trg_medewerker_verlof_overgedragen_set_modified
  before update on public.medewerker_verlof_overgedragen
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerker_verlof_overgedragen enable row level security;

drop policy if exists "anon kan medewerker_verlof_overgedragen lezen" on public.medewerker_verlof_overgedragen;
create policy "anon kan medewerker_verlof_overgedragen lezen"
  on public.medewerker_verlof_overgedragen for select to anon using (true);

drop policy if exists "anon kan medewerker_verlof_overgedragen toevoegen" on public.medewerker_verlof_overgedragen;
create policy "anon kan medewerker_verlof_overgedragen toevoegen"
  on public.medewerker_verlof_overgedragen for insert to anon with check (true);

drop policy if exists "anon kan medewerker_verlof_overgedragen bewerken" on public.medewerker_verlof_overgedragen;
create policy "anon kan medewerker_verlof_overgedragen bewerken"
  on public.medewerker_verlof_overgedragen for update to anon using (true) with check (true);

drop policy if exists "anon kan medewerker_verlof_overgedragen verwijderen" on public.medewerker_verlof_overgedragen;
create policy "anon kan medewerker_verlof_overgedragen verwijderen"
  on public.medewerker_verlof_overgedragen for delete to anon using (true);

-- ============================================================================
-- medewerker_verzuim_perioden (kort + lang ziekteperioden per medewerker)
-- ============================================================================
--
-- 1-op-veel: één medewerker kan meerdere verzuim-perioden hebben.
-- type='kort' of 'lang' bepaalt in welke tabel hij op de UI verschijnt
-- (tabblad "Kort verzuim" vs "Lang verzuim" op de medewerker-detail-pagina).
-- medewerker_id is soft-FK naar medewerkers.id (text). Beschrijving is HTML
-- uit de inline RTE.

create table if not exists public.medewerker_verzuim_perioden (
  id uuid primary key default gen_random_uuid(),
  medewerker_id text not null,
  type text not null check (type in ('kort', 'lang')),
  eerst_ziektedag date not null,
  verwachte_terug date,
  werkelijke_terug date,
  beschrijving text,
  status text not null default 'Actief' check (status in ('Actief', 'Hersteld')),
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists medewerker_verzuim_perioden_emp_idx
  on public.medewerker_verzuim_perioden (medewerker_id);

create index if not exists medewerker_verzuim_perioden_emp_type_idx
  on public.medewerker_verzuim_perioden (medewerker_id, type);

create index if not exists medewerker_verzuim_perioden_eerst_ziektedag_idx
  on public.medewerker_verzuim_perioden (eerst_ziektedag desc);

drop trigger if exists trg_medewerker_verzuim_perioden_set_modified on public.medewerker_verzuim_perioden;
create trigger trg_medewerker_verzuim_perioden_set_modified
  before update on public.medewerker_verzuim_perioden
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerker_verzuim_perioden enable row level security;

drop policy if exists "anon kan medewerker_verzuim_perioden lezen" on public.medewerker_verzuim_perioden;
create policy "anon kan medewerker_verzuim_perioden lezen"
  on public.medewerker_verzuim_perioden for select to anon using (true);

drop policy if exists "anon kan medewerker_verzuim_perioden toevoegen" on public.medewerker_verzuim_perioden;
create policy "anon kan medewerker_verzuim_perioden toevoegen"
  on public.medewerker_verzuim_perioden for insert to anon with check (true);

drop policy if exists "anon kan medewerker_verzuim_perioden bewerken" on public.medewerker_verzuim_perioden;
create policy "anon kan medewerker_verzuim_perioden bewerken"
  on public.medewerker_verzuim_perioden for update to anon using (true) with check (true);

drop policy if exists "anon kan medewerker_verzuim_perioden verwijderen" on public.medewerker_verzuim_perioden;
create policy "anon kan medewerker_verzuim_perioden verwijderen"
  on public.medewerker_verzuim_perioden for delete to anon using (true);

-- ============================================================================
-- Storage: bucket "client-documents" voor cliënt-bijlagen
-- ============================================================================
--
-- Cliëntdocumenten worden vanaf Stage 4d-pre als bestand in Supabase Storage
-- opgeslagen i.p.v. base64 in de tabel-kolom file_data. Pad-conventie:
--   <client_id>/<doc_id>-<safe_file_name>
-- De bucket is publiek (= directe URL voor downloads, geen signed URLs nodig).
-- Voor strengere security kan dit later via signed URLs worden vervangen.

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', true)
on conflict (id) do nothing;

drop policy if exists "anon kan client-documents lezen" on storage.objects;
create policy "anon kan client-documents lezen"
  on storage.objects for select to anon
  using (bucket_id = 'client-documents');

drop policy if exists "anon kan client-documents uploaden" on storage.objects;
create policy "anon kan client-documents uploaden"
  on storage.objects for insert to anon
  with check (bucket_id = 'client-documents');

drop policy if exists "anon kan client-documents bewerken" on storage.objects;
create policy "anon kan client-documents bewerken"
  on storage.objects for update to anon
  using (bucket_id = 'client-documents')
  with check (bucket_id = 'client-documents');

drop policy if exists "anon kan client-documents verwijderen" on storage.objects;
create policy "anon kan client-documents verwijderen"
  on storage.objects for delete to anon
  using (bucket_id = 'client-documents');

-- ============================================================================
-- Stage 4d: medewerker_documenten — tabel + Storage bucket
-- ============================================================================
--
-- Spiegelt het client_documents-patroon (Stage 4d-pre). Bestanden komen in
-- bucket "medewerker-documenten" onder pad:
--   <medewerker_id>/<doc_id>-<safe_file_name>
-- De tabel houdt alleen metadata + storage_path. file_data blijft als
-- legacy-veld voor migratie van bestaande base64-data uit
-- localStorage["employeeEditsById"][<id>].documenten.

create table if not exists public.medewerker_documenten (
  id text primary key,
  medewerker_id text not null,
  naam text not null default '',
  type text default '',
  vervaldatum text default '',
  uploaddatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  archived boolean not null default false,
  file_name text default '',
  file_mime text default '',
  file_data text default '',          -- legacy base64-veld, alleen voor migratie
  storage_path text                   -- pad in bucket "medewerker-documenten"
);

create index if not exists medewerker_documenten_medewerker_id_idx
  on public.medewerker_documenten (medewerker_id);
create index if not exists medewerker_documenten_archived_idx
  on public.medewerker_documenten (archived);
create index if not exists medewerker_documenten_type_idx
  on public.medewerker_documenten (lower(type));
create index if not exists medewerker_documenten_storage_path_idx
  on public.medewerker_documenten (storage_path)
  where storage_path is not null;

drop trigger if exists set_medewerker_documenten_laatst_gewijzigd on public.medewerker_documenten;
create trigger set_medewerker_documenten_laatst_gewijzigd
  before update on public.medewerker_documenten
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerker_documenten enable row level security;

drop policy if exists "anon kan medewerker_documenten lezen" on public.medewerker_documenten;
create policy "anon kan medewerker_documenten lezen"
  on public.medewerker_documenten for select to anon using (true);

drop policy if exists "anon kan medewerker_documenten toevoegen" on public.medewerker_documenten;
create policy "anon kan medewerker_documenten toevoegen"
  on public.medewerker_documenten for insert to anon with check (true);

drop policy if exists "anon kan medewerker_documenten bijwerken" on public.medewerker_documenten;
create policy "anon kan medewerker_documenten bijwerken"
  on public.medewerker_documenten for update to anon using (true) with check (true);

drop policy if exists "anon kan medewerker_documenten verwijderen" on public.medewerker_documenten;
create policy "anon kan medewerker_documenten verwijderen"
  on public.medewerker_documenten for delete to anon using (true);

insert into storage.buckets (id, name, public)
values ('medewerker-documenten', 'medewerker-documenten', true)
on conflict (id) do nothing;

drop policy if exists "anon kan medewerker-documenten lezen" on storage.objects;
create policy "anon kan medewerker-documenten lezen"
  on storage.objects for select to anon
  using (bucket_id = 'medewerker-documenten');

drop policy if exists "anon kan medewerker-documenten uploaden" on storage.objects;
create policy "anon kan medewerker-documenten uploaden"
  on storage.objects for insert to anon
  with check (bucket_id = 'medewerker-documenten');

drop policy if exists "anon kan medewerker-documenten bewerken" on storage.objects;
create policy "anon kan medewerker-documenten bewerken"
  on storage.objects for update to anon
  using (bucket_id = 'medewerker-documenten')
  with check (bucket_id = 'medewerker-documenten');

drop policy if exists "anon kan medewerker-documenten verwijderen" on storage.objects;
create policy "anon kan medewerker-documenten verwijderen"
  on storage.objects for delete to anon
  using (bucket_id = 'medewerker-documenten');


-- =============================================================================
-- Stage 8b: profiles-tabel + rollen + auto-create trigger
-- =============================================================================
-- Maakt voor elke auth.user automatisch een rij in public.profiles aan met:
--   - rol ('admin' | 'medewerker' | 'viewer')
--   - voornaam/achternaam (voor display in topbar i.p.v. email)
--   - optionele link naar public.medewerkers (matcht op email)
--
-- Bestaande gebruikers worden gebackfilled met rol 'admin' (eerste admin).
-- Toekomstige nieuwe users via Dashboard krijgen default 'medewerker'.
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  voornaam text not null default '',
  achternaam text not null default '',
  rol text not null default 'medewerker' check (rol in ('admin', 'medewerker', 'viewer')),
  medewerker_id uuid references public.medewerkers(id) on delete set null,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists profiles_rol_idx on public.profiles (rol);
create index if not exists profiles_medewerker_id_idx on public.profiles (medewerker_id);
create index if not exists profiles_email_idx on public.profiles (lower(email));

drop trigger if exists trg_profiles_set_modified on public.profiles;
create trigger trg_profiles_set_modified
  before update on public.profiles
  for each row execute function public.set_laatst_gewijzigd();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, voornaam, achternaam, rol, medewerker_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'voornaam', ''),
    coalesce(new.raw_user_meta_data->>'achternaam', ''),
    'medewerker',
    (select m.id from public.medewerkers m
       where lower(coalesce(m.email, '')) = lower(coalesce(new.email, ''))
         and not coalesce(m.archived, false)
       limit 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, email, voornaam, achternaam, rol, medewerker_id)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'voornaam', ''),
  coalesce(u.raw_user_meta_data->>'achternaam', ''),
  'admin',
  (select m.id from public.medewerkers m
     where lower(coalesce(m.email, '')) = lower(coalesce(u.email, ''))
       and not coalesce(m.archived, false)
     limit 1)
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = user_id and rol = 'admin'
  );
$$;

create or replace function public.current_user_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from public.profiles where id = auth.uid()));

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- =============================================================================
-- Stage 8c: zet alle 'anon'-policies om naar 'authenticated'
-- =============================================================================
-- Dit blok is idempotent en pakt dynamisch elke policy in public.* en
-- storage.objects op waar 'anon' in de roles-lijst staat. Voor elke match:
--   1. drop de oude (anon) policy
--   2. drop eventuele eerder gemaakte 'auth'-tweeling (idempotent)
--   3. recreate met identieke USING/WITH CHECK, maar TO authenticated
--
-- Daardoor blijft schema.sql canonical: zelfs als hierboven nog 'to anon'
-- policies staan voor backwards-compatibility, worden ze door dit slot-blok
-- direct omgezet zodra de hele schema.sql wordt uitgerold.
-- =============================================================================

do $$
declare
  pol record;
  new_name text;
  using_clause text;
  check_clause text;
begin
  for pol in
    select
      schemaname,
      tablename,
      policyname,
      cmd,
      qual,
      with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and 'anon' = any(roles)
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      pol.policyname, pol.schemaname, pol.tablename
    );

    new_name := regexp_replace(pol.policyname, '^anon\b', 'auth');
    if new_name = pol.policyname then
      new_name := 'auth: ' || pol.policyname;
    end if;

    execute format(
      'drop policy if exists %I on %I.%I',
      new_name, pol.schemaname, pol.tablename
    );

    using_clause := case
      when pol.qual is not null then ' using (' || pol.qual || ')'
      else ''
    end;

    check_clause := case
      when pol.with_check is not null then ' with check (' || pol.with_check || ')'
      else ''
    end;

    execute format(
      'create policy %I on %I.%I for %s to authenticated%s%s',
      new_name, pol.schemaname, pol.tablename,
      pol.cmd, using_clause, check_clause
    );
  end loop;
end $$;

-- =============================================================================
-- Stage 9c: incidenten — meldingen rond cliënten
-- =============================================================================
create table if not exists public.incidenten (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clienten(id) on delete set null,
  categorie text not null default 'Overig'
    check (categorie in ('Val', 'Medicatie', 'Agressie', 'Vermissing',
                         'Materiele schade', 'Privacy/AVG', 'Overig')),
  status text not null default 'in_afwachting'
    check (status in ('in_afwachting', 'in_behandeling', 'opgelost')),
  beoordelaar_id uuid references public.medewerkers(id) on delete set null,
  melder_id uuid references public.medewerkers(id) on delete set null,
  locatie_id uuid references public.locaties(id) on delete set null,
  incident_datum timestamptz not null default now(),
  omschrijving text not null default '',
  genomen_maatregelen text not null default '',
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  archived boolean not null default false
);

create index if not exists incidenten_client_id_idx on public.incidenten (client_id);
create index if not exists incidenten_status_idx on public.incidenten (status) where archived = false;
create index if not exists incidenten_beoordelaar_idx on public.incidenten (beoordelaar_id);
create index if not exists incidenten_melder_idx on public.incidenten (melder_id);
create index if not exists incidenten_locatie_idx on public.incidenten (locatie_id);
create index if not exists incidenten_archived_idx on public.incidenten (archived);
create index if not exists incidenten_incident_datum_idx on public.incidenten (incident_datum desc);

drop trigger if exists trg_incidenten_set_modified on public.incidenten;
create trigger trg_incidenten_set_modified
  before update on public.incidenten
  for each row execute function public.set_laatst_gewijzigd();

alter table public.incidenten enable row level security;

drop policy if exists "auth kan incidenten lezen" on public.incidenten;
create policy "auth kan incidenten lezen"
  on public.incidenten for select to authenticated using (true);

drop policy if exists "auth kan incidenten toevoegen" on public.incidenten;
create policy "auth kan incidenten toevoegen"
  on public.incidenten for insert to authenticated with check (true);

drop policy if exists "auth kan incidenten bewerken" on public.incidenten;
create policy "auth kan incidenten bewerken"
  on public.incidenten for update to authenticated using (true) with check (true);

drop policy if exists "auth kan incidenten verwijderen" on public.incidenten;
create policy "auth kan incidenten verwijderen"
  on public.incidenten for delete to authenticated using (true);