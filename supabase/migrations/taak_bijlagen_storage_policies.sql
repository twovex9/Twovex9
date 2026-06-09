-- =====================================================================
-- taak_bijlagen_storage_policies.sql — ontbrekende storage.objects-policies
-- voor de bucket 'taak-bijlagen' (bijlagen in de taak-gespreksdraad).
-- ---------------------------------------------------------------------
-- BUG (sinds takenmodule v2 / PR #576): de bucket 'taak-bijlagen' bestond wel,
-- maar er waren GEEN storage.objects-policies voor → RLS weigerde elke upload met
-- "new row violates row-level security policy". Gevolg: een bestand-bijlage in de
-- gespreksdraad kon door NIEMAND worden geplaatst (de tekst-opmerking lukte wel,
-- de bijlage faalde met "Plaatsen mislukt"). Gevonden bij de volledige live-hertest
-- 2026-06-09.
--
-- Fix: de 4 ontbrekende policies toevoegen, authenticated-only, conform
-- werkpatronen 6d-ter en identiek aan de bucket 'beleid-documenten'. De fijnmazige
-- toegangscontrole zit al op de tabel public.taak_bijlagen (taak-zichtbaarheid +
-- uploader_id = auth.uid()); de storage-policies hoeven alleen ingelogde toegang
-- tot de bucket te verlenen.
--
-- Uitvoeren op productie (ukjflilnhigozfoxowmj):
--   node scripts/db-exec.mjs --file supabase/migrations/taak_bijlagen_storage_policies.sql
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('taak-bijlagen', 'taak-bijlagen', true)
on conflict (id) do nothing;

drop policy if exists "auth kan taak-bijlagen lezen" on storage.objects;
create policy "auth kan taak-bijlagen lezen"
  on storage.objects for select to authenticated
  using (bucket_id = 'taak-bijlagen');

drop policy if exists "auth kan taak-bijlagen uploaden" on storage.objects;
create policy "auth kan taak-bijlagen uploaden"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'taak-bijlagen');

drop policy if exists "auth kan taak-bijlagen bewerken" on storage.objects;
create policy "auth kan taak-bijlagen bewerken"
  on storage.objects for update to authenticated
  using (bucket_id = 'taak-bijlagen') with check (bucket_id = 'taak-bijlagen');

drop policy if exists "auth kan taak-bijlagen verwijderen" on storage.objects;
create policy "auth kan taak-bijlagen verwijderen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'taak-bijlagen');
