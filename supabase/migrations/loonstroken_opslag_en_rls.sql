-- Loonstroken: PDF-opslag per loondienstmedewerker per maand.
-- Salarisadministratie/HR/admin/eigenaar/directeur (is_hr) uploadt en beheert;
-- de medewerker bekijkt uitsluitend de EIGEN loonstroken (mobiele app).
-- Toegepast op de live-DB via Supabase MCP; hier vastgelegd voor traceerbaarheid.

create table if not exists public.loonstroken (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id),
  jaar integer not null,
  maand integer not null check (maand between 1 and 12),
  bestandspad text not null,
  bestandsnaam text,
  mime_type text,
  grootte_bytes bigint,
  notitie text,
  geupload_door uuid,
  geupload_op timestamptz not null default now(),
  laatst_gewijzigd timestamptz not null default now(),
  archived boolean not null default false,
  constraint loonstroken_uniek_per_maand unique (medewerker_id, jaar, maand)
);

create index if not exists loonstroken_medewerker_idx on public.loonstroken (medewerker_id);
create index if not exists loonstroken_periode_idx on public.loonstroken (jaar desc, maand desc);

alter table public.loonstroken enable row level security;

create or replace function public.set_loonstroken_updated()
returns trigger language plpgsql as $$
begin
  new.laatst_gewijzigd := now();
  return new;
end;
$$;
drop trigger if exists trg_loonstroken_updated on public.loonstroken;
create trigger trg_loonstroken_updated before update on public.loonstroken
  for each row execute function public.set_loonstroken_updated();

-- Tabel-RLS
drop policy if exists "loonstroken select eigen of hr" on public.loonstroken;
create policy "loonstroken select eigen of hr" on public.loonstroken
  for select to authenticated
  using ( public.is_eigen_medewerker(medewerker_id::text) or public.is_hr() );

drop policy if exists "loonstroken insert hr" on public.loonstroken;
create policy "loonstroken insert hr" on public.loonstroken
  for insert to authenticated
  with check ( public.is_hr() );

drop policy if exists "loonstroken update hr" on public.loonstroken;
create policy "loonstroken update hr" on public.loonstroken
  for update to authenticated
  using ( public.is_hr() ) with check ( public.is_hr() );

drop policy if exists "loonstroken delete hr" on public.loonstroken;
create policy "loonstroken delete hr" on public.loonstroken
  for delete to authenticated
  using ( public.is_hr() );

-- Private bucket
insert into storage.buckets (id, name, public)
values ('loonstroken','loonstroken', false)
on conflict (id) do nothing;

-- Storage-RLS: eerste pad-segment = medewerker_id (eigen) of is_hr
drop policy if exists "loonstroken obj select" on storage.objects;
create policy "loonstroken obj select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'loonstroken' and (
      public.is_hr() or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.medewerker_id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "loonstroken obj insert" on storage.objects;
create policy "loonstroken obj insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'loonstroken' and public.is_hr() );

drop policy if exists "loonstroken obj update" on storage.objects;
create policy "loonstroken obj update" on storage.objects
  for update to authenticated
  using ( bucket_id = 'loonstroken' and public.is_hr() )
  with check ( bucket_id = 'loonstroken' and public.is_hr() );

drop policy if exists "loonstroken obj delete" on storage.objects;
create policy "loonstroken obj delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'loonstroken' and public.is_hr() );
