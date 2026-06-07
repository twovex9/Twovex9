-- verzuim_documenten — documenten-laag voor verzuimtrajecten (verzuim-dashboard).
-- Spiegelt incident_documenten, maar de FK verwijst naar verzuim.id (text) en de
-- bucket is PRIVÉ (gezondheidsdata, AVG art. 9): toegang via signed URLs en alleen
-- voor kantoorpersoneel (is_office_staff()), consistent met verzuim.verzuim_select_office.
-- Reeds toegepast op de remote via mcp apply_migration; hier voor reproduceerbaarheid.

-- 1) Tabel + RLS ------------------------------------------------------------------
create table if not exists public.verzuim_documenten (
  id              text primary key,
  verzuim_id      text not null,
  naam            text not null default '',
  uploaddatum     timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  archived        boolean not null default false,
  file_name       text default '',
  file_mime       text default '',
  file_size       bigint default 0,
  storage_path    text
);

create index if not exists verzuim_documenten_verzuim_id_idx
  on public.verzuim_documenten (verzuim_id);

alter table public.verzuim_documenten enable row level security;

drop policy if exists "verzuim_documenten_select_office" on public.verzuim_documenten;
create policy "verzuim_documenten_select_office"
  on public.verzuim_documenten for select
  using (is_office_staff());

drop policy if exists "verzuim_documenten_insert_authenticated" on public.verzuim_documenten;
create policy "verzuim_documenten_insert_authenticated"
  on public.verzuim_documenten for insert
  with check (true);

drop policy if exists "verzuim_documenten_update_authenticated" on public.verzuim_documenten;
create policy "verzuim_documenten_update_authenticated"
  on public.verzuim_documenten for update
  using (true) with check (true);

drop policy if exists "verzuim_documenten_delete_authenticated" on public.verzuim_documenten;
create policy "verzuim_documenten_delete_authenticated"
  on public.verzuim_documenten for delete
  using (true);

drop policy if exists "bureau_lockout" on public.verzuim_documenten;
create policy "bureau_lockout"
  on public.verzuim_documenten for all
  using ((select (not is_bureau_only_user())))
  with check ((select (not is_bureau_only_user())));

-- 2) Privé Storage-bucket + office-only policies ---------------------------------
insert into storage.buckets (id, name, public)
values ('verzuim-documenten', 'verzuim-documenten', false)
on conflict (id) do nothing;

drop policy if exists "verzuim-documenten obj select" on storage.objects;
create policy "verzuim-documenten obj select"
  on storage.objects for select to authenticated
  using (bucket_id = 'verzuim-documenten' and is_office_staff());

drop policy if exists "verzuim-documenten obj insert" on storage.objects;
create policy "verzuim-documenten obj insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'verzuim-documenten' and is_office_staff());

drop policy if exists "verzuim-documenten obj update" on storage.objects;
create policy "verzuim-documenten obj update"
  on storage.objects for update to authenticated
  using (bucket_id = 'verzuim-documenten' and is_office_staff())
  with check (bucket_id = 'verzuim-documenten' and is_office_staff());

drop policy if exists "verzuim-documenten obj delete" on storage.objects;
create policy "verzuim-documenten obj delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'verzuim-documenten' and is_office_staff());
