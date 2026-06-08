-- ============================================================================
-- Rol-gebaseerde module-zichtbaarheid (2026-06-08)
-- ============================================================================
-- Doel: niet-admin rollen zien alleen hun eigen onderdelen. Admin-tier
-- (Eigenaar/Admin/Directeur) houdt het complete overzicht (besaCan bypass).
-- Werkt door op zowel de desktop-suite als de mobiele app (gedeelde Supabase).
--
-- Gewenste eindstand (✓ = mag zien):
--   Rol         Nieuws  Planning   Incidenten  Financiën  HR
--   Planner       ✓       ✓           –           –        –
--   Beleid        ✓       –           ✓           –        –   (cliënten behouden)
--   HR            ✓       –           –           –        ✓
--   Finance       ✓       ✓ inzien    ✓ inzien    ✓        –
--   Facilitair    ✓       ✓ inzien    ✓ inzien    –        –
--   Medewerker  (ongewijzigd: ✓ nieuws/planning/incidenten)
--
-- Nieuws is universeel geregeld via permissions-page-map.js ("nieuws.html": null),
-- niet via per-rol announcements-rechten.
--
-- Idempotent: deletes zijn no-op als de slug al weg is; inserts via NOT EXISTS.
-- Reeds live uitgevoerd op 2026-06-08; backup in public._bak_role_perms_20260608.
-- ============================================================================

begin;

-- PLANNER (5e200620-…): financiën (facturen) + HR-dossier weg
delete from public.bs2_role_permissions
where role_id = '5e200620-a1da-462f-bc8e-7d052f98f21e'
  and permission_slug in ('browse-invoices','view-invoices','manage-invoices',
                          'browse-employees','view-employees');

-- BELEID (653d0a8c-…): financiën (beschikkingen) + HR weg; incidenten-dashboard erbij
delete from public.bs2_role_permissions
where role_id = '653d0a8c-7939-4b06-a81c-8972d80974e7'
  and permission_slug in ('browse-dispositions','view-dispositions',
                          'browse-employees','view-employee-financial-info','view-employee-professionals');

insert into public.bs2_role_permissions (role_id, permission_slug, is_hierarchical)
select '653d0a8c-7939-4b06-a81c-8972d80974e7', s, false
from (values ('view-incident-dashboard')) as v(s)
where not exists (select 1 from public.bs2_role_permissions
                  where role_id = '653d0a8c-7939-4b06-a81c-8972d80974e7' and permission_slug = v.s);

-- HR (66410d7e-…): planning weg
delete from public.bs2_role_permissions
where role_id = '66410d7e-7984-432c-801f-6a4b6fcf2f2e'
  and permission_slug in ('view-planning');

-- FINANCE (ea01a8dd-…): planning + incidenten inzien erbij (financiën behouden)
insert into public.bs2_role_permissions (role_id, permission_slug, is_hierarchical)
select 'ea01a8dd-5e2a-4074-8bff-9eb61d4a0933', s, false
from (values ('view-planning'),('view-incidents'),('view-incident-dashboard')) as v(s)
where not exists (select 1 from public.bs2_role_permissions
                  where role_id = 'ea01a8dd-5e2a-4074-8bff-9eb61d4a0933' and permission_slug = v.s);

-- FACILITAIR (3a4c47f8-…): planning + incidenten inzien erbij
insert into public.bs2_role_permissions (role_id, permission_slug, is_hierarchical)
select '3a4c47f8-1d49-458c-9f8e-861e032a3a0d', s, false
from (values ('view-planning'),('view-incidents'),('view-incident-dashboard')) as v(s)
where not exists (select 1 from public.bs2_role_permissions
                  where role_id = '3a4c47f8-1d49-458c-9f8e-861e032a3a0d' and permission_slug = v.s);

commit;

-- ----------------------------------------------------------------------------
-- ROLLBACK (handmatig): zet de 5 rollen terug uit de backup-snapshot
-- ----------------------------------------------------------------------------
-- begin;
--   delete from public.bs2_role_permissions
--   where role_id in ('5e200620-a1da-462f-bc8e-7d052f98f21e','653d0a8c-7939-4b06-a81c-8972d80974e7',
--                     '66410d7e-7984-432c-801f-6a4b6fcf2f2e','ea01a8dd-5e2a-4074-8bff-9eb61d4a0933',
--                     '3a4c47f8-1d49-458c-9f8e-861e032a3a0d');
--   insert into public.bs2_role_permissions select * from public._bak_role_perms_20260608;
-- commit;
