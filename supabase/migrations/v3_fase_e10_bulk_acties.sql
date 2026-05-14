-- v3 Fase E.10 — Bulk-acties RPC functies
--
-- Per user-keuze #21: 1-op-1 BS2 bulk-acties.
-- Performante bulk-mutations via Postgres RPC ipv N individuele UPDATEs.
--
-- Doel: voor 100+ medewerkers efficiently selecteren+archiveren via 1 query.
--
-- Audit-trail: per bulk-call 1 audit_log entry met "bulk_archive [N records]".
--
-- LIVE applied via Supabase Studio SQL Editor.

-- ============================================================================
-- 1. bulk_archive_clienten(ids[]) — bulk-archiveren cliënten
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bulk_archive_clienten(p_ids text[], p_archived boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $func$
DECLARE
  affected_count integer;
  actor uuid;
  action_label text;
BEGIN
  actor := auth.uid();
  action_label := CASE WHEN p_archived THEN 'archiveren' ELSE 'herstellen' END;

  UPDATE public.clienten
  SET archived = p_archived,
      laatst_gewijzigd = now()
  WHERE id = ANY(p_ids);

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  -- Audit-log entry (bulk)
  INSERT INTO public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  VALUES ('Cliënt', 'BULK:' || array_length(p_ids, 1)::text,
          CASE WHEN p_archived THEN 'archiveren' ELSE 'herstellen' END,
          actor, 'bulk-actie',
          'Bulk ' || action_label || ' van ' || affected_count || ' cliënten',
          'succes', now());

  RETURN jsonb_build_object('success', true, 'affected', affected_count, 'action', action_label);
END;
$func$;

COMMENT ON FUNCTION public.bulk_archive_clienten IS
  'Fase E.10 — Bulk-archive/restore voor cliënten. p_archived=true → archiveer, false → herstel.';

REVOKE EXECUTE ON FUNCTION public.bulk_archive_clienten FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_archive_clienten TO authenticated;

-- ============================================================================
-- 2. bulk_archive_medewerkers(ids[]) — bulk-archiveren medewerkers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bulk_archive_medewerkers(p_ids uuid[], p_archived boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $func$
DECLARE
  affected_count integer;
  actor uuid;
  action_label text;
BEGIN
  actor := auth.uid();
  action_label := CASE WHEN p_archived THEN 'archiveren' ELSE 'herstellen' END;

  UPDATE public.medewerkers
  SET archived = p_archived,
      laatst_gewijzigd = now()
  WHERE id = ANY(p_ids);

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  INSERT INTO public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  VALUES ('Medewerker', 'BULK:' || array_length(p_ids, 1)::text,
          CASE WHEN p_archived THEN 'archiveren' ELSE 'herstellen' END,
          actor, 'bulk-actie',
          'Bulk ' || action_label || ' van ' || affected_count || ' medewerkers',
          'succes', now());

  RETURN jsonb_build_object('success', true, 'affected', affected_count, 'action', action_label);
END;
$func$;

COMMENT ON FUNCTION public.bulk_archive_medewerkers IS
  'Fase E.10 — Bulk-archive/restore voor medewerkers.';

REVOKE EXECUTE ON FUNCTION public.bulk_archive_medewerkers FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_archive_medewerkers TO authenticated;
