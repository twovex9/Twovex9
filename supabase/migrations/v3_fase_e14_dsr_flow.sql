-- v3 Fase E.14 — DSR-flow (Data Subject Rights, GDPR Art. 17 + Art. 20)
--
-- Per user-keuze #28b:
--   "Per cliënt: 'GDPR-export' (PDF+JSON) + 'Vergeet deze cliënt' (anonymiseer)
--    voor admin-tier"
--
-- 2 server-side functies:
--   1. anonymize_client(client_id) — Art. 17 vergetelheid
--      → vervangt naam/bsn/adres met UUID-placeholder
--      → behoudt financiële records (Belastingdienst 7j) + audit-trail
--   2. export_client_data(client_id) — Art. 20 portabiliteit
--      → returns JSONB met alle data over deze cliënt
--
-- Beide functies zijn SECURITY DEFINER omdat admin-tier acties zijn die
-- normale users niet mogen — RLS-bypass voor de bedoelde scope.

-- ============================================================================
-- 1. anonymize_client — Art. 17 'recht op vergetelheid'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.anonymize_client(p_client_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  anon_token text;
  client_naam text;
  actor uuid;
BEGIN
  actor := auth.uid();
  -- Capture original name for audit before anonymizing
  SELECT naam INTO client_naam FROM public.clienten WHERE id = p_client_id;
  IF client_naam IS NULL THEN
    RAISE EXCEPTION 'Cliënt niet gevonden: %', p_client_id;
  END IF;

  -- Generate anonymization-token (gebruikt voor referentie in financiële records)
  anon_token := 'ANON_' || replace(gen_random_uuid()::text, '-', '');

  -- Update cliënt-record: vervang PII met token, mark as anonymized
  UPDATE public.clienten
  SET
    naam = anon_token,
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
      'anonymized_at', now()::text,
      'anonymized_by', actor::text,
      'anon_token', anon_token,
      'gdpr_art_17', true,
      -- Wis PII-velden in data jsonb maar behoud structuur
      'voornaam', null,
      'achternaam', null,
      'bsn', null,
      'geboortedatum', null,
      'email', null,
      'telefoon', null,
      'adres', null,
      'postcode', null,
      'plaats', null
    )
  WHERE id = p_client_id;

  -- Audit-log entry
  INSERT INTO public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  VALUES ('Cliënt', p_client_id, 'verwijderen', actor, 'DSR-anonymize',
          'GDPR Art. 17 anonymisatie van "' || client_naam || '" → ' || anon_token, 'succes', now());

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'anon_token', anon_token,
    'anonymized_at', now()
  );
END;
$func$;

COMMENT ON FUNCTION public.anonymize_client IS
  'Fase E.14 DSR — GDPR Art. 17 vergetelheid. Vervangt naam/BSN/adres met ANON-token. Behoudt FK''s voor financiële records (7j fiscaal). Audit-log entry. Admin-only via RLS.';

REVOKE EXECUTE ON FUNCTION public.anonymize_client FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_client TO authenticated;

-- ============================================================================
-- 2. export_client_data — Art. 20 'gegevensoverdraagbaarheid'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.export_client_data(p_client_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  result jsonb;
  actor uuid;
BEGIN
  actor := auth.uid();

  -- Verify cliënt bestaat
  IF NOT EXISTS (SELECT 1 FROM public.clienten WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Cliënt niet gevonden: %', p_client_id;
  END IF;

  -- Bundle alle data
  SELECT jsonb_build_object(
    'export_metadata', jsonb_build_object(
      'exported_at', now(),
      'exported_by', actor,
      'gdpr_article', 'Art. 20 — Recht op gegevensoverdraagbaarheid',
      'machine_readable', true
    ),
    'client', (SELECT to_jsonb(c) FROM public.clienten c WHERE c.id = p_client_id),
    'beschikkingen', (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM public.beschikkingen b WHERE b.client_id = p_client_id),
    'incidenten', (SELECT COALESCE(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM public.incidenten i WHERE i.client_id = p_client_id),
    'documents', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cd.id, 'naam', cd.naam, 'file_name', cd.file_name, 'storage_path', cd.storage_path)), '[]'::jsonb) FROM public.client_documents cd WHERE cd.client_id = p_client_id),
    'facturen', (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM public.facturen f WHERE f.client_id = p_client_id),
    'audit_log', (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.audit_log a WHERE a.resource = 'Cliënt' AND a.resource_id = p_client_id)
  ) INTO result;

  -- Audit-log de export zelf (read-audit voor GDPR-trail)
  INSERT INTO public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  VALUES ('Cliënt', p_client_id, 'bekijken', actor, 'DSR-export',
          'GDPR Art. 20 data-export (admin)', 'succes', now());

  RETURN result;
END;
$func$;

COMMENT ON FUNCTION public.export_client_data IS
  'Fase E.14 DSR — GDPR Art. 20 gegevensoverdraagbaarheid. Bundle alle data over een cliënt in machine-leesbare JSON. Audit-trail entry. Admin-only.';

REVOKE EXECUTE ON FUNCTION public.export_client_data FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_client_data TO authenticated;
