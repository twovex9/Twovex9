-- ============================================================================
-- HR Module v4 — G35: verzuim_acties (re-integratie-acties per verzuimcasus)
-- ============================================================================
-- Idempotent. Toepassen: node scripts/apply-migrations.mjs hr_v4_verzuim_acties.sql
-- verzuim.id = text (legacy). Office-only RLS, zelfde model als verzuim_mijlpalen.

create table if not exists public.verzuim_acties (
  id uuid primary key default gen_random_uuid(),
  verzuim_id text references public.verzuim(id) on delete cascade,
  omschrijving text not null,
  deadline date,
  voltooid_op date,
  uitgevoerd_door uuid,
  aanmaakdatum timestamptz default now(),
  laatst_gewijzigd timestamptz default now()
);
create index if not exists idx_verzuim_acties_verzuim on public.verzuim_acties(verzuim_id);

alter table public.verzuim_acties enable row level security;
drop policy if exists "vact_select_office" on public.verzuim_acties;
drop policy if exists "vact_insert_office" on public.verzuim_acties;
drop policy if exists "vact_update_office" on public.verzuim_acties;
drop policy if exists "vact_delete_office" on public.verzuim_acties;
create policy "vact_select_office" on public.verzuim_acties for select to authenticated using (public.is_office_staff());
create policy "vact_insert_office" on public.verzuim_acties for insert to authenticated with check (public.is_office_staff());
create policy "vact_update_office" on public.verzuim_acties for update to authenticated using (public.is_office_staff()) with check (public.is_office_staff());
create policy "vact_delete_office" on public.verzuim_acties for delete to authenticated using (public.is_office_staff());

select 'hr_v4_verzuim_acties OK' as result;
