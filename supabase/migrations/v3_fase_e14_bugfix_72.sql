-- v3 Fase E.14 Bug #72 fix — anonymize_client schema-correctie
--
-- Probleem: clienten heeft voornaam + achternaam (geen 'naam' kolom).
-- Originele functie referenceerde clienten.naam → schema-mismatch.
--
-- Fix: gebruik voornaam + achternaam, met TRIM voor de audit-log
-- entry zodat originele naam vóór anonymisatie behouden blijft in
-- de audit-trail.
--
-- LIVE applied 2026-05-14 via Supabase Studio.

CREATE OR REPLACE FUNCTION public.anonymize_client(p_client_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  anon_token text;
  client_naam text;
  actor uuid;
BEGIN
  actor := auth.uid();
  SELECT TRIM(COALESCE(voornaam, '') || ' ' || COALESCE(achternaam, ''))
    INTO client_naam FROM public.clienten WHERE id = p_client_id;
  IF client_naam IS NULL THEN
    RAISE EXCEPTION 'Cliënt niet gevonden: %', p_client_id;
  END IF;

  anon_token := 'ANON_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.clienten
  SET
    voornaam = anon_token,
    achternaam = '',
    data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
      'anonymized_at', now()::text,
      'anonymized_by', actor::text,
      'anon_token', anon_token,
      'gdpr_art_17', true,
      'bsn', null, 'geboortedatum', null,
      'email', null, 'telefoon', null,
      'adres', null, 'postcode', null, 'plaats', null,
      'orig_voornaam_redacted', true,
      'orig_achternaam_redacted', true
    )
  WHERE id = p_client_id;

  INSERT INTO public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  VALUES ('Cliënt', p_client_id, 'verwijderen', actor, 'DSR-anonymize',
          'GDPR Art. 17 anonymisatie van "' || client_naam || '" → ' || anon_token, 'succes', now());

  RETURN jsonb_build_object('success', true, 'client_id', p_client_id, 'anon_token', anon_token, 'anonymized_at', now());
END;
$func$;

COMMENT ON FUNCTION public.anonymize_client IS
  'Fase E.14 DSR (Bug #72 fix) — Art. 17 vergetelheid via voornaam+achternaam schema.';

REVOKE EXECUTE ON FUNCTION public.anonymize_client FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_client TO authenticated;
