-- v3 Fase G.7 — Bug #82 fix
--
-- Probleem: audit_log.actie CHECK constraint accepteerde alleen generieke waardes
-- ('aanmaken', 'bekijken', 'bewerken', 'verwijderen', 'archiveren', 'herstellen', 'status_wijziging').
-- De admin-user-mgmt Edge Function schrijft specifieke user-mgmt actie-namen
-- (Aangemaakt, WachtwoordGereset, 2FAGereset, RolGewijzigd, Gedeactiveerd, Geactiveerd) → silent fail.
--
-- Detectie: tijdens CLEAN RUN #1 van G.5 — Edge Function-calls succesvol, maar audit_log was leeg.
-- Post-fix: 6 audit_log entries voor de testflow correct geschreven met actor + target + details JSON.

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_actie_check;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actie_check CHECK (
  actie = ANY (ARRAY[
    -- Bestaande generieke acties
    'aanmaken'::text,
    'bekijken'::text,
    'bewerken'::text,
    'verwijderen'::text,
    'archiveren'::text,
    'herstellen'::text,
    'status_wijziging'::text,
    -- Nieuwe user-management acties (G.5/G.6/G.7)
    'Aangemaakt'::text,
    'WachtwoordGereset'::text,
    '2FAGereset'::text,
    'RolGewijzigd'::text,
    'Gedeactiveerd'::text,
    'Geactiveerd'::text
  ])
);

-- Toegepast op productie 2026-05-15 via Supabase MCP apply_migration.
