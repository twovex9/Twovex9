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


-- ============================================================================
-- beschikkingen (Cliënten module — master entity)
-- ============================================================================
--
-- Soft FK naar clienten via client_id (text). Geen harde FK constraint, want we
-- willen legacy "test"-IDs (cl_99999, cl_99820, …) kunnen behouden zonder de
-- referentie te breken. Lookups gaan via cache (clienten-data.js).
--
-- Veel van de financiële velden zijn explicit numeric kolommen voor snelle
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
-- via "on conflict do nothing"; cliëntlabels worden at-runtime opgehaald uit
-- de clienten-cache (clienten-data.js → data.clientLabelOverride als override).
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
  ('b_besc_056', 'cl_99999', 'Test beschikking', 'amb', 'actief', '2024-12-31', '2025-11-26', 10, 'uur', 'Handmatig', 0, 0, 'betaald', '2024-12', '{"clientLabelOverride":"Test Cliënt"}'::jsonb),
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
