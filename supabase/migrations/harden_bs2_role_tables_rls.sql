-- harden_bs2_role_tables_rls.sql
-- SECURITY FIX (audit 2026-06-09): rol-toewijzing en rol-permissies waren via RLS
-- `using/check (true)` schrijfbaar voor ELKE ingelogde gebruiker. Een medewerker kon
-- daardoor zichzelf via REST de slug 'eigenaar'/'admin' toekennen (bs2_role_users) of
-- de eigen rol extra permissions geven (bs2_role_permissions) = privilege-escalatie.
--
-- Fix: INSERT/UPDATE/DELETE op de vier rol-definitietabellen alleen nog toestaan voor
-- admin-tier (public.is_admin(auth.uid()) → slug in admin/eigenaar/directeur OF
-- profiles.rol='admin'). SELECT blijft open (de app moet rollen kunnen lezen voor
-- permissie-gating) en de RESTRICTIVE bureau_scope op bs2_role_users blijft staan.
-- De admin-user-mgmt Edge Function gebruikt de service-role en omzeilt RLS, dus de
-- legitieme gebruikersbeheer-flow blijft volledig werken.
--
-- Idempotent: drop+create per policy. Reversibel: zet using/check terug op (true).

-- ===== bs2_role_users =====
drop policy if exists "auth kan bs2_role_users toevoegen" on public.bs2_role_users;
create policy "auth kan bs2_role_users toevoegen"
  on public.bs2_role_users for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_role_users bewerken" on public.bs2_role_users;
create policy "auth kan bs2_role_users bewerken"
  on public.bs2_role_users for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_role_users verwijderen" on public.bs2_role_users;
create policy "auth kan bs2_role_users verwijderen"
  on public.bs2_role_users for delete to authenticated
  using (public.is_admin(auth.uid()));

-- ===== bs2_role_permissions =====
drop policy if exists "auth kan bs2_role_permissions toevoegen" on public.bs2_role_permissions;
create policy "auth kan bs2_role_permissions toevoegen"
  on public.bs2_role_permissions for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_role_permissions bewerken" on public.bs2_role_permissions;
create policy "auth kan bs2_role_permissions bewerken"
  on public.bs2_role_permissions for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_role_permissions verwijderen" on public.bs2_role_permissions;
create policy "auth kan bs2_role_permissions verwijderen"
  on public.bs2_role_permissions for delete to authenticated
  using (public.is_admin(auth.uid()));

-- ===== bs2_roles =====
drop policy if exists "auth kan bs2_roles toevoegen" on public.bs2_roles;
create policy "auth kan bs2_roles toevoegen"
  on public.bs2_roles for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_roles bewerken" on public.bs2_roles;
create policy "auth kan bs2_roles bewerken"
  on public.bs2_roles for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_roles verwijderen" on public.bs2_roles;
create policy "auth kan bs2_roles verwijderen"
  on public.bs2_roles for delete to authenticated
  using (public.is_admin(auth.uid()));

-- ===== bs2_hierarchy_levels =====
drop policy if exists "auth kan bs2_hierarchy_levels toevoegen" on public.bs2_hierarchy_levels;
create policy "auth kan bs2_hierarchy_levels toevoegen"
  on public.bs2_hierarchy_levels for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_hierarchy_levels bewerken" on public.bs2_hierarchy_levels;
create policy "auth kan bs2_hierarchy_levels bewerken"
  on public.bs2_hierarchy_levels for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "auth kan bs2_hierarchy_levels verwijderen" on public.bs2_hierarchy_levels;
create policy "auth kan bs2_hierarchy_levels verwijderen"
  on public.bs2_hierarchy_levels for delete to authenticated
  using (public.is_admin(auth.uid()));
