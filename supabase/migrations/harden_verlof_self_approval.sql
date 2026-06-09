-- harden_verlof_self_approval.sql
-- SECURITY FIX (audit 2026-06-09): verlof_aanvragen UPDATE stond op
-- (is_office_staff() OR is_eigen_medewerker(...)) voor zowel USING als WITH CHECK.
-- Daardoor kon een medewerker zijn EIGEN aanvraag via REST op status
-- 'goedgekeurd' zetten (zelf-goedkeuring) — de UI verbergt de knop, maar RLS
-- stond het toe.
--
-- Fix: splits de UPDATE-policy.
--  * Office-staff (teamleider/HR/admin/…) mag aanvragen volledig bijwerken
--    (beoordelen = goedkeuren/afwijzen). Dit is de legitieme beoordeel-flow.
--  * De eigen medewerker mag zijn eigen aanvraag alleen bijwerken naar een
--    NIET-beoordeelde status (concept/ingediend/geannuleerd). De WITH CHECK
--    blokkeert 'goedgekeurd'/'afgewezen' door de aanvrager zelf.
--
-- PERMISSIVE policies worden ge-OR'd; voor UPDATE eist Postgres dat één
-- USING (oude rij) én één WITH CHECK (nieuwe rij) slaagt. Een medewerker die
-- zijn eigen rij op 'goedgekeurd' zet: oude rij matcht alleen de eigen-USING,
-- maar geen enkele WITH CHECK accepteert status='goedgekeurd' (office-check
-- faalt want geen office; eigen-check faalt door de status-restrictie) → DENIED.

drop policy if exists "va_update_office_of_eigen" on public.verlof_aanvragen;

drop policy if exists "va_update_office" on public.verlof_aanvragen;
create policy "va_update_office"
  on public.verlof_aanvragen for update to authenticated
  using (is_office_staff())
  with check (is_office_staff());

drop policy if exists "va_update_eigen_beperkt" on public.verlof_aanvragen;
create policy "va_update_eigen_beperkt"
  on public.verlof_aanvragen for update to authenticated
  using (is_eigen_medewerker((medewerker_id)::text))
  with check (
    is_eigen_medewerker((medewerker_id)::text)
    and status not in ('goedgekeurd', 'afgewezen')
  );
