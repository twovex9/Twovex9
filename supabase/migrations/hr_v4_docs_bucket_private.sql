-- ============================================================================
-- HR Module v4 — G46: medewerker-documenten bucket PRIVATE + signed URLs
-- ============================================================================
-- Idempotent. Toepasbaar via: node scripts/apply-migrations.mjs hr_v4_docs_bucket_private.sql
--
-- Probleem: de bucket stond op public=true → iedereen op internet met een URL
-- kon personeelsdocumenten (VOG's, ID's, contracten) downloaden, zonder login.
-- Fix: bucket private; de app gebruikt voortaan tijdelijke signed URLs
-- (medewerker-documenten-data.js). Storage-RLS aangescherpt naar hetzelfde
-- model als de tabel (mdoc_*): lezen/uploaden = office OF eigen dossier
-- (padconventie: '<medewerker_id>/<doc_id>-<bestandsnaam>').
-- Edge-functies (onboarding-upload, contract-sign) gebruiken service_role en
-- merken hier niets van.
-- ============================================================================

update storage.buckets set public = false where id = 'medewerker-documenten';

-- Lezen: office-staff OF de eigen medewerker (map-prefix = medewerker_id).
drop policy if exists "auth kan medewerker-documenten lezen" on storage.objects;
drop policy if exists "mdoc_obj_select_office_of_eigen" on storage.objects;
create policy "mdoc_obj_select_office_of_eigen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'medewerker-documenten'
    and (public.is_office_staff() or public.is_eigen_medewerker((storage.foldername(name))[1]))
  );

-- Uploaden: office OF eigen dossier (zelfde model als mdoc_insert_hr_of_eigen).
drop policy if exists "auth kan medewerker-documenten uploaden" on storage.objects;
drop policy if exists "mdoc_obj_insert_office_of_eigen" on storage.objects;
create policy "mdoc_obj_insert_office_of_eigen" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'medewerker-documenten'
    and (public.is_office_staff() or public.is_eigen_medewerker((storage.foldername(name))[1]))
  );

-- Bewerken (upsert-herupload): zelfde scope.
drop policy if exists "auth kan medewerker-documenten bewerken" on storage.objects;
drop policy if exists "mdoc_obj_update_office_of_eigen" on storage.objects;
create policy "mdoc_obj_update_office_of_eigen" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'medewerker-documenten'
    and (public.is_office_staff() or public.is_eigen_medewerker((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'medewerker-documenten'
    and (public.is_office_staff() or public.is_eigen_medewerker((storage.foldername(name))[1]))
  );

-- DELETE blijft hr-gated ("hr kan medewerker-documenten verwijderen").

select 'hr_v4_docs_bucket_private OK' as result;
