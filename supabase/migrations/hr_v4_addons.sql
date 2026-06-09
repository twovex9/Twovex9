-- ============================================================================
-- HR Module v4 — ADD-ONS: Opleidingsmodule (G40-42) + Functioneringscyclus (G36-39)
-- ============================================================================
-- Door user expliciet gevraagd. Catalogus-uitbreiding + per-medewerker koppeltabel
-- (certificaat/SKJ-punten/herhaaldata) en functioneringsgesprekken/doelen/
-- verbetertrajecten/waarschuwingen. Per-medewerker dossierdata = office-only RLS.
-- Idempotent.
-- ============================================================================

-- ── Opleidingen-catalogus uitbreiden (G40/G41/G42) ─────────────────────────
alter table public.opleidingen add column if not exists categorie text;            -- BHV|medicatie|agressie|SKJ|overig
alter table public.opleidingen add column if not exists geldigheidsduur_maanden integer; -- voor recertificering/herhaaldatum
alter table public.opleidingen add column if not exists skj_punten numeric;         -- SKJ-puntenwaarde
alter table public.opleidingen add column if not exists is_academy boolean default false; -- interne ETF Academy

-- ── Koppeltabel medewerker ↔ opleiding (G40/G41/G42) ───────────────────────
create table if not exists public.medewerker_opleidingen (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  opleiding_id uuid references public.opleidingen(id) on delete set null,
  opleiding_naam text,                 -- snapshot/vrije tekst indien geen catalogus-koppeling
  categorie text,                      -- overgenomen of vrij (BHV/medicatie/agressie/SKJ/overig)
  status text default 'gepland',       -- gepland|behaald|verlopen
  behaaldatum date,
  verloopdatum date,                   -- herhaaldatum (recertificering)
  skj_punten numeric,
  certificaat_pad text,                -- Storage-pad certificaat
  notitie text,
  data jsonb,
  archived boolean default false,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);
create index if not exists idx_mw_opleidingen_medewerker on public.medewerker_opleidingen(medewerker_id) where coalesce(archived,false)=false;
create index if not exists idx_mw_opleidingen_verloop on public.medewerker_opleidingen(verloopdatum) where coalesce(archived,false)=false and verloopdatum is not null;

-- ── Functioneringsgesprekken (G36) ─────────────────────────────────────────
create table if not exists public.functioneringsgesprekken (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  type text not null default 'functionering',  -- functionering|beoordeling|voortgang
  gepland_op date,
  gehouden_op date,
  status text not null default 'gepland',       -- gepland|gehouden|afgerond|geannuleerd
  score text,                                   -- vrij: onvoldoende|voldoende|goed|uitstekend
  samenvatting text,
  gespreksvoerder_id uuid,                       -- profiles.id
  data jsonb,
  archived boolean default false,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);
create index if not exists idx_funct_gesprek_medewerker on public.functioneringsgesprekken(medewerker_id) where coalesce(archived,false)=false;

-- ── Doelen gekoppeld aan gesprek (G37) ─────────────────────────────────────
create table if not exists public.functionering_doelen (
  id uuid primary key default gen_random_uuid(),
  gesprek_id uuid references public.functioneringsgesprekken(id) on delete cascade,
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  omschrijving text not null,
  deadline date,
  status text default 'open',                    -- open|behaald|vervallen
  opleiding_id uuid references public.opleidingen(id) on delete set null,
  data jsonb,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);
create index if not exists idx_funct_doel_medewerker on public.functionering_doelen(medewerker_id);
create index if not exists idx_funct_doel_gesprek on public.functionering_doelen(gesprek_id);

-- ── Verbetertrajecten (G38) ────────────────────────────────────────────────
create table if not exists public.verbetertrajecten (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  startdatum date,
  einddatum date,
  doel text,
  status text default 'lopend',                  -- lopend|afgerond|gestopt
  evaluatie text,
  data jsonb,
  archived boolean default false,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);
create index if not exists idx_verbetertraject_medewerker on public.verbetertrajecten(medewerker_id) where coalesce(archived,false)=false;

-- ── Officiële waarschuwingen / dossieropbouw (G39) ─────────────────────────
create table if not exists public.medewerker_waarschuwingen (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  type text not null default 'mondeling',        -- mondeling|schriftelijk|officieel|laatste
  datum date,
  reden text,
  toelichting text,
  uitgevaardigd_door uuid,
  document_pad text,                             -- optioneel Storage
  data jsonb,
  archived boolean default false,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);
create index if not exists idx_mw_waarschuwing_medewerker on public.medewerker_waarschuwingen(medewerker_id) where coalesce(archived,false)=false;

-- ── RLS: per-medewerker HR-dossierdata = office-only (is_office_staff) ──────
do $rls$
declare t text;
begin
  foreach t in array array[
    'medewerker_opleidingen','functioneringsgesprekken','functionering_doelen',
    'verbetertrajecten','medewerker_waarschuwingen'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select_office', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_office', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_office', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_office', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_office_staff())', t||'_select_office', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_office_staff())', t||'_insert_office', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff())', t||'_update_office', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_office_staff())', t||'_delete_office', t);
  end loop;
end;
$rls$;

select 'hr_v4_addons OK' as result;
