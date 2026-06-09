-- beleid-documenten storage-policies (bron: supabase/schema.sql 4330-4353).
-- Ontbraken op productie (geen DDL-pad) → Beleid kon beleid niet uploaden/bewerken (video 1).
insert into storage.buckets (id, name, public)
values ('beleid-documenten', 'beleid-documenten', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "auth kan beleid-documenten lezen" on storage.objects;
create policy "auth kan beleid-documenten lezen"
  on storage.objects for select to authenticated
  using (bucket_id = 'beleid-documenten');

drop policy if exists "auth kan beleid-documenten uploaden" on storage.objects;
create policy "auth kan beleid-documenten uploaden"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'beleid-documenten');

drop policy if exists "auth kan beleid-documenten bewerken" on storage.objects;
create policy "auth kan beleid-documenten bewerken"
  on storage.objects for update to authenticated
  using (bucket_id = 'beleid-documenten')
  with check (bucket_id = 'beleid-documenten');

drop policy if exists "auth kan beleid-documenten verwijderen" on storage.objects;
create policy "auth kan beleid-documenten verwijderen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'beleid-documenten');

select 'beleid-documenten storage-policies toegepast' as resultaat;
