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

-- Seed-data opleidingen (idempotent)
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
