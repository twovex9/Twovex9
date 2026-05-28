-- Clientbeheer-uitbreiding: hoofdaannemer + verwijzer-notities + Crisisopvang zorgsoort.
-- Volledig additief en idempotent. Geen DELETE/DROP/TRUNCATE. Bestaande data onaangeroerd.
-- Toegepast op Supabase 2026-05-28 (PR #1 van de Clientbeheer-sprint).

-- 1) Cliënt: optioneel veld "Hoofdaannemer" (vrije tekst + datalist, zoals bestaande `organisatie`-kolom)
alter table public.clienten
  add column if not exists hoofdaannemer text;

-- 2) Verwijzer-notities (1-op-veel per organisatie). Geen FK-cascade (DIEHARD: nooit
--    data meezuigen bij parent-delete); volgt het bestaande sub-tabel-patroon
--    (indexed text-kolom, zoals beschikking_tarieven.beschikking_id).
create table if not exists public.organisatie_notities (
  id uuid primary key default gen_random_uuid(),
  organisatie_id text not null,
  tekst text not null default '',
  auteur text,
  archived boolean not null default false,
  aanmaakdatum timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now()
);

create index if not exists organisatie_notities_org_idx
  on public.organisatie_notities (organisatie_id);
create index if not exists organisatie_notities_archived_idx
  on public.organisatie_notities (archived);

drop trigger if exists trg_organisatie_notities_set_modified on public.organisatie_notities;
create trigger trg_organisatie_notities_set_modified
  before update on public.organisatie_notities
  for each row execute function public.set_laatst_gewijzigd();

alter table public.organisatie_notities enable row level security;

drop policy if exists "auth kan organisatie_notities lezen" on public.organisatie_notities;
create policy "auth kan organisatie_notities lezen"
  on public.organisatie_notities for select to authenticated using (true);

drop policy if exists "auth kan organisatie_notities toevoegen" on public.organisatie_notities;
create policy "auth kan organisatie_notities toevoegen"
  on public.organisatie_notities for insert to authenticated with check (true);

drop policy if exists "auth kan organisatie_notities bewerken" on public.organisatie_notities;
create policy "auth kan organisatie_notities bewerken"
  on public.organisatie_notities for update to authenticated using (true) with check (true);

drop policy if exists "auth kan organisatie_notities verwijderen" on public.organisatie_notities;
create policy "auth kan organisatie_notities verwijderen"
  on public.organisatie_notities for delete to authenticated using (true);

-- 3) Zorgsoort "Crisisopvang" (dagtarief = verblijf, geldt voor alle dagen in periode).
--    Idempotent: alleen invoegen als er nog geen actieve Crisisopvang bestaat.
insert into public.zorgsoorten (naam, tarieftype, archived)
select 'Crisisopvang', 'dag', false
where not exists (
  select 1 from public.zorgsoorten
  where lower(naam) = lower('Crisisopvang') and archived = false
);
