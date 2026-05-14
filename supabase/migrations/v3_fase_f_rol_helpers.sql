-- v3 Fase F — Rol-permissies helpers
--
-- Per user-keuze #14: 1-op-1 BS2-spiegel, 12 rollen (skip medewerkertest).
-- Per user-keuze: admin-tier = eigenaar, admin, directeur (mogen users beheren).
--
-- Helpers:
--   1. current_user_rol_name() → naam van actuele rol (uit org_roles via profiles.rol_id)
--   2. is_admin_tier() → boolean voor eigenaar/admin/directeur
--   3. is_role(rol_name) → boolean check
--
-- LIVE applied via Supabase Studio.

-- ============================================================================
-- 1. current_user_rol_name() — haal rol-naam van auth-user
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_user_rol_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT r.naam
  FROM public.profiles p
  LEFT JOIN public.org_roles r ON r.id = p.rol_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_rol_name IS
  'Fase F — Retourneert rol-naam (uit org_roles) voor de huidige auth-user. NULL als profile geen rol_id heeft.';

GRANT EXECUTE ON FUNCTION public.current_user_rol_name() TO authenticated;

-- ============================================================================
-- 2. is_admin_tier() — eigenaar / admin / directeur
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin_tier()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    public.current_user_rol_name() IN ('Eigenaar', 'Admin', 'Directeur'),
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin_tier IS
  'Fase F — True als huidige user behoort tot admin-tier (Eigenaar/Admin/Directeur). Deze rollen mogen users beheren, password+2FA resetten, rol wijzigen.';

GRANT EXECUTE ON FUNCTION public.is_admin_tier() TO authenticated;

-- ============================================================================
-- 3. is_role(rol_name) — check tegen specifieke rol-naam
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_role(p_rol_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(public.current_user_rol_name() = p_rol_name, false);
$$;

COMMENT ON FUNCTION public.is_role IS
  'Fase F — Check of huidige user de gegeven rol heeft. Gebruik: SELECT public.is_role(''HR'') in RLS-policies.';

GRANT EXECUTE ON FUNCTION public.is_role(text) TO authenticated;
