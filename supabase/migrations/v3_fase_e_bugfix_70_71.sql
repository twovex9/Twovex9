-- v3 Fase E bug-fix migration — Bug #70 + #71
--
-- Bug #70: check_optimistic_lock() faalde op uuid-PK tabellen (medewerkers/clienten/etc.)
--   met "operator does not exist: uuid = text". Fix via cast id::text in WHERE-clause.
-- Bug #71: audit_log_actie_check constraint miste 'bekijken' actie voor read-audit (Fase E.6).
--   log_read_audit() faalde met check-constraint violation.
--
-- Toegepast LIVE 2026-05-14 via Supabase Studio.

-- ============================================================================
-- Bug #70 — check_optimistic_lock uuid-PK cast
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_optimistic_lock(
  p_table_name text,
  p_id text,
  p_client_updated_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $func$
DECLARE
  db_updated_at timestamptz;
  sql_query text;
BEGIN
  IF p_table_name NOT IN ('medewerkers', 'clienten', 'beschikkingen', 'facturen', 'incidenten',
                          'planning', 'beleidsdocumenten', 'teams', 'org_roles', 'notification_types',
                          'medewerker_notities', 'medewerker_documenten', 'medewerker_verzuim_perioden',
                          'medewerker_verlof_overgedragen', 'client_documents', 'salarishuis_wijzigingen',
                          'incident_categorieen', 'zorgsoorten', 'opleidingen', 'competenties',
                          'locaties', 'bureaus', 'gemeenten', 'organisaties', 'nieuws',
                          'werkuren', 'urendeclaraties', 'uren_budget') THEN
    RAISE EXCEPTION 'Optimistic-lock check not allowed for table: %', p_table_name;
  END IF;

  -- Bug #70 fix: cast id::text voor uuid-PK compatibiliteit
  sql_query := format('SELECT laatst_gewijzigd FROM public.%I WHERE id::text = $1', p_table_name);
  EXECUTE sql_query INTO db_updated_at USING p_id;

  IF db_updated_at IS NULL THEN
    RETURN false;
  END IF;

  RETURN abs(extract(epoch FROM (db_updated_at - p_client_updated_at))) < 1.0;
END;
$func$;

COMMENT ON FUNCTION public.check_optimistic_lock IS
  'Fase E.11 (Bug #70 fix) — uuid-PK compatible via id::text cast.';

-- ============================================================================
-- Bug #71 — audit_log_actie_check: add 'bekijken' voor read-audit
-- ============================================================================
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_actie_check;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actie_check
  CHECK (actie = ANY (ARRAY['aanmaken'::text, 'bekijken'::text, 'bewerken'::text, 'verwijderen'::text, 'archiveren'::text, 'herstellen'::text, 'status_wijziging'::text]));

COMMENT ON CONSTRAINT audit_log_actie_check ON public.audit_log IS
  'Bug #71 fix — added bekijken voor Fase E.6 read-audit support.';
