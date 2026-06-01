-- ============================================================================
-- Automatische kilometervergoeding woon -> werk
-- ============================================================================
-- Feature (Lionel/HR, 2026-06-01): bereken per dienstdag automatisch de
-- woon-werk kilometers (heen + terug) voor LOONDIENST-medewerkers op basis van
-- hun woonadres (HR) en de werklocatie van die dag. Op de 1e van de nieuwe
-- maand worden alle dienstdagen van de vorige maand uitgerekend; de medewerker
-- keurt het overzicht goed (indienen) -> salarisadministratie.
--
-- Dit bestand documenteert de DB-objecten. De tabel hieronder is al via
-- `apply_migration` (km_afstanden_matrix) toegepast; hier staat-ie idempotent
-- zodat een verse deploy 'm ook krijgt. De generatie-functie + pg_cron volgen
-- in een vervolg (PR2).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PR1 — Woon-werk afstandsmatrix (medewerker x locatie, enkele reis in km)
-- ----------------------------------------------------------------------------
-- bron='auto'      -> berekend via geo-distance.js (PDOK geocode + OSRM route)
-- bron='handmatig' -> HR-correctie; wordt NOOIT door een auto-herberekening
--                     overschreven (zie kmAfstandenDB.upsert + recalcBatch).
create table if not exists public.medewerker_locatie_afstanden (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  locatie_id uuid not null references public.locaties(id) on delete cascade,
  km_enkel numeric,
  bron text not null default 'auto',
  laatst_berekend timestamptz,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  unique (medewerker_id, locatie_id)
);

create index if not exists mla_medewerker_idx on public.medewerker_locatie_afstanden (medewerker_id);
create index if not exists mla_locatie_idx on public.medewerker_locatie_afstanden (locatie_id);

drop trigger if exists trg_mla_set_modified on public.medewerker_locatie_afstanden;
create trigger trg_mla_set_modified
  before update on public.medewerker_locatie_afstanden
  for each row execute function public.set_laatst_gewijzigd();

alter table public.medewerker_locatie_afstanden enable row level security;

drop policy if exists "auth kan mla lezen" on public.medewerker_locatie_afstanden;
create policy "auth kan mla lezen"
  on public.medewerker_locatie_afstanden for select to authenticated using (true);

drop policy if exists "auth kan mla toevoegen" on public.medewerker_locatie_afstanden;
create policy "auth kan mla toevoegen"
  on public.medewerker_locatie_afstanden for insert to authenticated with check (true);

drop policy if exists "auth kan mla bewerken" on public.medewerker_locatie_afstanden;
create policy "auth kan mla bewerken"
  on public.medewerker_locatie_afstanden for update to authenticated using (true) with check (true);

drop policy if exists "auth kan mla verwijderen" on public.medewerker_locatie_afstanden;
create policy "auth kan mla verwijderen"
  on public.medewerker_locatie_afstanden for delete to authenticated using (true);
