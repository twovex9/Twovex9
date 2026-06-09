-- ============================================================================
-- HR Module v4 — G44/G55: Server-side RLS-hardening HR-kerntabellen
-- ============================================================================
-- Idempotent. Toepasbaar via: node scripts/db-exec.mjs --file supabase/migrations/hr_v4_rls_hardening.sql
--
-- Probleem: enkele HR-kerntabellen stonden nog volledig open (using/with_check = true),
-- waardoor élke ingelogde gebruiker (incl. rol 'medewerker') verlofaanvragen, HR-notities,
-- ziekteperioden en medewerkerrecords van iederéén kon lezen/schrijven via de REST-API
-- (ook al verbergt de UI dat). Dit gate't ze server-side via de bestaande helpers.
--
-- Rolbron = bs2_role_users (email-match) -> bs2_roles.slug, via:
--   is_office_staff()  -> alle rollen behalve medewerker/medewerker-test/detacheringsbureau (+ admin)
--   is_hr()            -> admin/eigenaar/directeur/hr/salarisadministratie
--   is_eigen_medewerker(text) -> profiles.medewerker_id van de ingelogde user
--
-- bureau_lockout (RESTRICTIVE) blijft op elke tabel staan en wordt door Postgres
-- ge-AND'd met onderstaande PERMISSIVE policies — dus bureau-only users blijven
-- sowieso buitengesloten. Onderstaande policies bepalen de positieve toegang.
--
-- App-impact geverifieerd: geen self-service pagina schrijft naar medewerkers; de
-- medewerker-rol bereikt de office-pagina's (medewerker.html/index) niet; verlof-self-
-- service (mijn-verlof.js) leest/schrijft enkel eigen rijen; verzuim/notities-datalagen
-- laden alleen op office-pagina's (+ planning leest verzuim, daar nu eigen-only voor mw).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- medewerkers — SELECT blijft open (de hele app leest de medewerkerslijst app-breed;
-- kolom-niveau-afscherming van gevoelige jsonb-velden is een aparte, grotere stap).
-- Writes (INSERT/UPDATE/DELETE) -> office-staff. De medewerker-rol kan zo geen
-- medewerkerrecords meer aanmaken/wijzigen/verwijderen via de API.
-- ----------------------------------------------------------------------------
alter table public.medewerkers enable row level security;

drop policy if exists "auth: anon kan medewerkers toevoegen" on public.medewerkers;
drop policy if exists "auth: anon kan medewerkers bewerken" on public.medewerkers;
drop policy if exists "auth: anon kan medewerkers verwijderen" on public.medewerkers;
drop policy if exists "mw_insert_office" on public.medewerkers;
drop policy if exists "mw_update_office" on public.medewerkers;
drop policy if exists "mw_delete_office" on public.medewerkers;

create policy "mw_insert_office" on public.medewerkers
  for insert to authenticated with check (public.is_office_staff());
create policy "mw_update_office" on public.medewerkers
  for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
create policy "mw_delete_office" on public.medewerkers
  for delete to authenticated using (public.is_office_staff());

-- ----------------------------------------------------------------------------
-- verlof_aanvragen — was volledig open. medewerker_id is uuid -> cast naar text.
-- SELECT/INSERT/UPDATE: office OF eigen (medewerker dient eigen aanvraag in/wijzigt
-- 'm tot ingediend; teamleider/HR verwerken = office). DELETE: office (medewerker
-- annuleert via status-update, niet via delete; office archiveert/verwijdert).
-- ----------------------------------------------------------------------------
alter table public.verlof_aanvragen enable row level security;

drop policy if exists "auth kan verlof_aanvragen lezen" on public.verlof_aanvragen;
drop policy if exists "auth kan verlof_aanvragen toevoegen" on public.verlof_aanvragen;
drop policy if exists "auth kan verlof_aanvragen bewerken" on public.verlof_aanvragen;
drop policy if exists "auth kan verlof_aanvragen verwijderen" on public.verlof_aanvragen;
drop policy if exists "va_select_office_of_eigen" on public.verlof_aanvragen;
drop policy if exists "va_insert_office_of_eigen" on public.verlof_aanvragen;
drop policy if exists "va_update_office_of_eigen" on public.verlof_aanvragen;
drop policy if exists "va_delete_office" on public.verlof_aanvragen;

create policy "va_select_office_of_eigen" on public.verlof_aanvragen
  for select to authenticated
  using (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id::text));
create policy "va_insert_office_of_eigen" on public.verlof_aanvragen
  for insert to authenticated
  with check (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id::text));
create policy "va_update_office_of_eigen" on public.verlof_aanvragen
  for update to authenticated
  using (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id::text))
  with check (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id::text));
create policy "va_delete_office" on public.verlof_aanvragen
  for delete to authenticated using (public.is_office_staff());

-- ----------------------------------------------------------------------------
-- medewerker_notities — interne HR-notities; SELECT was open (true).
-- Office-only lezen (geen self-service pagina leest notities). Writes al hr-gated.
-- ----------------------------------------------------------------------------
alter table public.medewerker_notities enable row level security;

drop policy if exists "mnot_select_open_authenticated" on public.medewerker_notities;
drop policy if exists "mnot_select_office" on public.medewerker_notities;
create policy "mnot_select_office" on public.medewerker_notities
  for select to authenticated using (public.is_office_staff());

-- ----------------------------------------------------------------------------
-- medewerker_verzuim_perioden — ziektedata; SELECT was open (true).
-- Office OF eigen (medewerker mag eigen periode zien; geen leak van collega's).
-- Writes al hr/admin-gated. medewerker_id is text.
-- ----------------------------------------------------------------------------
alter table public.medewerker_verzuim_perioden enable row level security;

drop policy if exists "mvp_select_open_authenticated" on public.medewerker_verzuim_perioden;
drop policy if exists "mvp_select_office_of_eigen" on public.medewerker_verzuim_perioden;
create policy "mvp_select_office_of_eigen" on public.medewerker_verzuim_perioden
  for select to authenticated
  using (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id));

-- ----------------------------------------------------------------------------
-- medewerker_verlof_overgedragen — verlofsaldo; was volledig open. medewerker_id text.
-- SELECT: office OF eigen (mijn-verlof leest eigen saldo). Writes: office (HR zet saldi).
-- ----------------------------------------------------------------------------
alter table public.medewerker_verlof_overgedragen enable row level security;

drop policy if exists "auth: anon kan medewerker_verlof_overgedragen lezen" on public.medewerker_verlof_overgedragen;
drop policy if exists "auth: anon kan medewerker_verlof_overgedragen toevoegen" on public.medewerker_verlof_overgedragen;
drop policy if exists "auth: anon kan medewerker_verlof_overgedragen bewerken" on public.medewerker_verlof_overgedragen;
drop policy if exists "auth: anon kan medewerker_verlof_overgedragen verwijderen" on public.medewerker_verlof_overgedragen;
drop policy if exists "mvo_select_office_of_eigen" on public.medewerker_verlof_overgedragen;
drop policy if exists "mvo_insert_office" on public.medewerker_verlof_overgedragen;
drop policy if exists "mvo_update_office" on public.medewerker_verlof_overgedragen;
drop policy if exists "mvo_delete_office" on public.medewerker_verlof_overgedragen;

create policy "mvo_select_office_of_eigen" on public.medewerker_verlof_overgedragen
  for select to authenticated
  using (public.is_office_staff() or public.is_eigen_medewerker(medewerker_id));
create policy "mvo_insert_office" on public.medewerker_verlof_overgedragen
  for insert to authenticated with check (public.is_office_staff());
create policy "mvo_update_office" on public.medewerker_verlof_overgedragen
  for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
create policy "mvo_delete_office" on public.medewerker_verlof_overgedragen
  for delete to authenticated using (public.is_office_staff());

select 'hr_v4_rls_hardening OK' as result;
