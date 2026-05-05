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
create or replace function public.set_laatst_gewijzigd()
returns trigger
language plpgsql
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
-- zorgsoorten (Cliënten module — referentiedata)
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
-- bureaus (HR module — referentiedata)
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
-- locaties (HR module — referentiedata met adres + kleur)
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
-- gemeenten (Cliënten module — referentiedata, ~224 NL gemeenten)
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
  'Nissewaard','Noardeast-Fryslân','Noord-Beveland','Noordenveld','Noordoostpolder',
  'Noordwijk','Nuenen, Gerwen en Nederwetten','Nunspeet',
  'Oegstgeest','Oirschot','Oisterwijk','Oldambt','Oldebroek','Oldenzaal','Olst-Wijhe',
  'Ommen','Oost Gelre','Oostzaan','Opsterland','Oss','Oude IJsselstreek','Overbetuwe',
  'Peel en Maas','Putten',
  'Raalte','Renkum','Renswoude','Reusel-De Mierden','Rheden','Ridderkerk','Rijswijk',
  'Roerdalen','Roosendaal','Rozendaal',
  'Schagen','Schoolder','SED Stede Broec','Sliedrecht','Soest','Someren',
  'Son en Breugel','Stadskanaal','Steenbergen','Stein','Súdwest-Fryslân',
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
-- medewerkers (HR module — master entity)
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
-- clienten (Cliënten module — master entity)
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

-- Seed van 85 cliënten. Idempotent: alleen invoegen als de id nog niet bestaat.
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
  ('cl_172','Noëlla','Duijvestijn',172,'Breedstraat','in zorg','Castricum',''),
  ('cl_171','Jay','Stevens',171,'Varnebroek','in zorg','Heiloo',''),
  ('cl_275','Danielle','Lamping',275,'Varnebroek','in zorg','Dijk en Waard',''),
  ('cl_293','Eliza','Zwart',293,'Breedstraat','in zorg','Heiloo',''),
  ('cl_259','Roël','Spiering',259,'Varnebroek','uit zorg','Uitgeest',''),
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
