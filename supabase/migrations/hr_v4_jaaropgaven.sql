-- ============================================================================
-- HR Module v4 — G20: Jaaropgaven (Mijn Salaris §8)
-- ============================================================================
-- Tabel + private bucket + RLS analoog aan loonstroken: HR uploadt, medewerker
-- bekijkt eigen jaaropgaven. Idempotent.
-- ============================================================================

create table if not exists public.jaaropgaven (
  id uuid primary key default gen_random_uuid(),
  medewerker_id uuid references public.medewerkers(id) on delete cascade,
  jaar integer not null,
  bestandspad text,
  bestandsnaam text,
  mime_type text,
  grootte_bytes bigint,
  notitie text,
  geupload_door uuid,
  geupload_op timestamptz default now(),
  laatst_gewijzigd timestamptz default now(),
  archived boolean default false,
  constraint jaaropgaven_uniek_per_jaar unique (medewerker_id, jaar)
);
create index if not exists jaaropgaven_medewerker_idx on public.jaaropgaven (medewerker_id);
create index if not exists jaaropgaven_jaar_idx on public.jaaropgaven (jaar desc);

create or replace function public.set_jaaropgaven_updated()
 returns trigger language plpgsql as $fn$ begin new.laatst_gewijzigd := now(); return new; end; $fn$;
drop trigger if exists trg_jaaropgaven_updated on public.jaaropgaven;
create trigger trg_jaaropgaven_updated before update on public.jaaropgaven
  for each row execute function public.set_jaaropgaven_updated();

alter table public.jaaropgaven enable row level security;
drop policy if exists "jaaropgaven select eigen of hr" on public.jaaropgaven;
create policy "jaaropgaven select eigen of hr" on public.jaaropgaven
  for select to authenticated using (public.is_eigen_medewerker(medewerker_id::text) or public.is_hr());
drop policy if exists "jaaropgaven insert hr" on public.jaaropgaven;
create policy "jaaropgaven insert hr" on public.jaaropgaven
  for insert to authenticated with check (public.is_hr());
drop policy if exists "jaaropgaven update hr" on public.jaaropgaven;
create policy "jaaropgaven update hr" on public.jaaropgaven
  for update to authenticated using (public.is_hr()) with check (public.is_hr());
drop policy if exists "jaaropgaven delete hr" on public.jaaropgaven;
create policy "jaaropgaven delete hr" on public.jaaropgaven
  for delete to authenticated using (public.is_hr());

-- Private bucket
insert into storage.buckets (id, name, public)
values ('jaaropgaven','jaaropgaven', false)
on conflict (id) do nothing;

-- Storage-RLS: eerste pad-segment = medewerker_id (eigen) of is_hr
drop policy if exists "jaaropgaven obj select" on storage.objects;
create policy "jaaropgaven obj select" on storage.objects
  for select to authenticated using (
    bucket_id = 'jaaropgaven' and (
      public.is_hr() or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.medewerker_id::text = (storage.foldername(name))[1]
      )
    )
  );
drop policy if exists "jaaropgaven obj insert" on storage.objects;
create policy "jaaropgaven obj insert" on storage.objects
  for insert to authenticated with check ( bucket_id = 'jaaropgaven' and public.is_hr() );
drop policy if exists "jaaropgaven obj update" on storage.objects;
create policy "jaaropgaven obj update" on storage.objects
  for update to authenticated using ( bucket_id = 'jaaropgaven' and public.is_hr() )
  with check ( bucket_id = 'jaaropgaven' and public.is_hr() );
drop policy if exists "jaaropgaven obj delete" on storage.objects;
create policy "jaaropgaven obj delete" on storage.objects
  for delete to authenticated using ( bucket_id = 'jaaropgaven' and public.is_hr() );

select 'hr_v4_jaaropgaven OK' as result;
