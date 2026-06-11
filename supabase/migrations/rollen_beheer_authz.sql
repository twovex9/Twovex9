-- rollen_beheer_authz.sql
-- ---------------------------------------------------------------------------
-- Spraakmemo eigenaar 2026-06-11 (14.20.12): "Bij instellingen → mijn profiel →
-- het kopje rollen mag de medewerker niet zelfstandig zijn rol aanpassen. De
-- enige personen die dat mogen aanpassen zijn de eigenaar, HR, directeur en de
-- admin. De rest van alle andere rollen mogen deze functie niet kunnen wijzigen
-- of aanpassen."
--
-- Server-side kern (deze migratie): rol-beheer = schrijven naar
-- bs2_role_users (wie heeft welke rol), bs2_role_permissions (rechten per rol)
-- en bs2_roles (de rollen zelf). De write-policies stonden op is_admin(auth.uid())
-- = {admin, eigenaar, directeur}. De eigenaar wil HR daar expliciet bij; alle
-- overige rollen (o.a. Zorgcoördinator, Planner) eruit.
--
-- We verbreden NIET is_admin() — die wordt overal voor de admin-tier gebruikt
-- (audit, impersonatie, gebruikersbeheer-edge-functie, talloze gates). In plaats
-- daarvan een aparte, smalle helper can_manage_roles() = de 4 toegestane rollen,
-- en we zetten alleen de rol-beheer write-policies daarop om.
--
-- De RESTRICTIVE bureau_scope-policy op bs2_role_users blijft ongemoeid (die
-- beperkt detacheringsbureau-only users extra; combineert met AND).
--
-- Productie-project: ukjflilnhigozfoxowmj. Idempotent (create or replace +
-- alter policy). Reversible: zie commentaar onderaan.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_roles(user_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'pg_catalog', 'public'
as $function$
  -- Mag rollen/rechten/rol-toewijzingen beheren: exact de 4 door de eigenaar
  -- aangewezen rollen — Eigenaar, HR, Directeur, Admin — plus de superadmin-klep
  -- (profiles.rol = 'admin'), gelijk aan is_admin().
  select exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = ru.role_id
    where p.id = user_id and r.slug in ('admin', 'eigenaar', 'directeur', 'hr')
  ) or exists(
    select 1 from public.profiles p where p.id = user_id and p.rol = 'admin'
  );
$function$;

comment on function public.can_manage_roles(uuid) is
  'True voor Eigenaar/HR/Directeur/Admin (slug) of profiles.rol=admin. Gate voor rol-beheer (bs2_role_users/_permissions/_roles writes). Spraakmemo eigenaar 2026-06-11.';

-- ── bs2_role_users (rol-toewijzingen: wie heeft welke rol) ──────────────────
alter policy "auth kan bs2_role_users toevoegen"  on public.bs2_role_users
  with check (public.can_manage_roles(auth.uid()));
alter policy "auth kan bs2_role_users bewerken"   on public.bs2_role_users
  using (public.can_manage_roles(auth.uid()))
  with check (public.can_manage_roles(auth.uid()));
alter policy "auth kan bs2_role_users verwijderen" on public.bs2_role_users
  using (public.can_manage_roles(auth.uid()));

-- ── bs2_role_permissions (rechten per rol) ──────────────────────────────────
alter policy "auth kan bs2_role_permissions toevoegen"  on public.bs2_role_permissions
  with check (public.can_manage_roles(auth.uid()));
alter policy "auth kan bs2_role_permissions bewerken"   on public.bs2_role_permissions
  using (public.can_manage_roles(auth.uid()))
  with check (public.can_manage_roles(auth.uid()));
alter policy "auth kan bs2_role_permissions verwijderen" on public.bs2_role_permissions
  using (public.can_manage_roles(auth.uid()));

-- ── bs2_roles (de rollen zelf) ──────────────────────────────────────────────
alter policy "auth kan bs2_roles toevoegen"  on public.bs2_roles
  with check (public.can_manage_roles(auth.uid()));
alter policy "auth kan bs2_roles bewerken"   on public.bs2_roles
  using (public.can_manage_roles(auth.uid()))
  with check (public.can_manage_roles(auth.uid()));
alter policy "auth kan bs2_roles verwijderen" on public.bs2_roles
  using (public.can_manage_roles(auth.uid()));

-- ---------------------------------------------------------------------------
-- ROLLBACK (terug naar is_admin op alle 9 policies):
--   alter policy "auth kan bs2_role_users toevoegen"  on public.bs2_role_users  with check (is_admin(auth.uid()));
--   alter policy "auth kan bs2_role_users bewerken"   on public.bs2_role_users  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
--   alter policy "auth kan bs2_role_users verwijderen" on public.bs2_role_users using (is_admin(auth.uid()));
--   ... (idem voor bs2_role_permissions en bs2_roles) ...
--   drop function if exists public.can_manage_roles(uuid);
-- ---------------------------------------------------------------------------
