-- _migrate_medewerker_docs_storage.sql
-- De storage-policies voor de bucket `medewerker-documenten` stonden nog op de oude
-- "anon dev"-policies (to anon). Daardoor kon een INGELOGDE (authenticated) gebruiker
-- — zowel een medewerker die zijn eigen dossier-document uploadt als HR — niets
-- uploaden via de app (alleen de service-key-import omzeilde RLS). Dit zet ze om naar
-- `to authenticated`, zodat de self-service upload (Mijn gegevens → Mijn documenten,
-- video-feedback eigenaar 2026-06-07) werkt. DELETE blijft beperkt tot admin/HR, zodat
-- een medewerker zijn documenten NIET kan verwijderen (spiegelt de RLS op
-- public.medewerker_documenten). De bucket is public → reads werken via getPublicUrl.

drop policy if exists "anon dev kan medewerker-documenten uploaden"     on storage.objects;
drop policy if exists "anon dev kan medewerker-documenten lezen"        on storage.objects;
drop policy if exists "anon dev kan medewerker-documenten bewerken"     on storage.objects;
drop policy if exists "anon dev kan medewerker-documenten verwijderen"  on storage.objects;

drop policy if exists "auth kan medewerker-documenten lezen"      on storage.objects;
create policy "auth kan medewerker-documenten lezen"
  on storage.objects for select to authenticated
  using (bucket_id = 'medewerker-documenten');

drop policy if exists "auth kan medewerker-documenten uploaden"   on storage.objects;
create policy "auth kan medewerker-documenten uploaden"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'medewerker-documenten');

drop policy if exists "auth kan medewerker-documenten bewerken"   on storage.objects;
create policy "auth kan medewerker-documenten bewerken"
  on storage.objects for update to authenticated
  using (bucket_id = 'medewerker-documenten')
  with check (bucket_id = 'medewerker-documenten');

drop policy if exists "hr kan medewerker-documenten verwijderen"  on storage.objects;
create policy "hr kan medewerker-documenten verwijderen"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'medewerker-documenten'
    and (is_admin(auth.uid()) or is_hr() or is_hr_admin_bs2())
  );
