-- v3 Fase E.1 — Schema-gaps voor productie-launch
--
-- Doel:
--   1. profiles.must_change_password (first-login enforcement, Fase G)
--   2. profiles.must_setup_2fa (2FA enrollment enforcement, Fase G)
--   3. helper-function voor optimistic locking (Fase E.11)
--   4. helper-function voor read-audit logging (Fase E.6, GDPR Art. 15)
--   5. helpdesk_settings tabel (Fase G.8)
--
-- Toepassen via Supabase Studio SQL Editor of via Supabase CLI:
--   supabase db push
--
-- Idempotent: gebruikt IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE.

-- ============================================================================
-- 1+2. profiles.must_change_password + must_setup_2fa
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS must_setup_2fa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Set true bij bulk-onboarding (Fase G) of admin-reset. Eerste login forceert wachtwoord-wijziging modal.';
COMMENT ON COLUMN public.profiles.must_setup_2fa IS
  'Set true bij bulk-onboarding (Fase G) of admin-2FA-reset. Forceert 2FA enrollment-wizard.';

-- ============================================================================
-- 3. Helper: optimistic locking check (Fase E.11)
-- ============================================================================
-- Used in UPDATE flows: if client-side updated_at differs from DB → conflict
CREATE OR REPLACE FUNCTION public.check_optimistic_lock(
  p_table_name text,
  p_id text,
  p_client_updated_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  db_updated_at timestamptz;
  sql_query text;
BEGIN
  -- Defensive: only allow specific tables
  IF p_table_name NOT IN ('medewerkers', 'clienten', 'beschikkingen', 'facturen', 'incidenten',
                          'planning', 'beleidsdocumenten', 'teams', 'org_roles', 'notification_types',
                          'medewerker_notities', 'medewerker_documenten', 'medewerker_verzuim_perioden',
                          'medewerker_verlof_overgedragen', 'client_documents', 'salarishuis_wijzigingen',
                          'incident_categorieen', 'zorgsoorten', 'opleidingen', 'competenties',
                          'locaties', 'bureaus', 'gemeenten', 'organisaties', 'nieuws',
                          'werkuren', 'urendeclaraties', 'uren_budget') THEN
    RAISE EXCEPTION 'Optimistic-lock check not allowed for table: %', p_table_name;
  END IF;

  sql_query := format('SELECT laatst_gewijzigd FROM public.%I WHERE id = $1', p_table_name);
  EXECUTE sql_query INTO db_updated_at USING p_id;

  IF db_updated_at IS NULL THEN
    RETURN false; -- record bestaat niet
  END IF;

  -- Allow 1-second tolerance for clock-drift
  RETURN abs(extract(epoch FROM (db_updated_at - p_client_updated_at))) < 1.0;
END;
$$;

COMMENT ON FUNCTION public.check_optimistic_lock IS
  'Fase E.11 — Client-side update flow: roep aan vóór UPDATE met laatst-bekende updated_at. False → conflict (record door iemand anders gewijzigd). 1-sec tolerance voor clock-drift.';

-- ============================================================================
-- 4. Helper: read-audit logging (Fase E.6, GDPR Art. 15 compliance)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_read_audit(
  p_resource text,
  p_resource_id text,
  p_user_id uuid DEFAULT NULL,
  p_user_label text DEFAULT 'Onbekend'
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  audit_id uuid;
  actor uuid;
BEGIN
  actor := COALESCE(p_user_id, auth.uid());
  INSERT INTO public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  VALUES (p_resource, p_resource_id, 'bekijken', actor, p_user_label, 'Read-access', 'succes', now())
  RETURNING id INTO audit_id;
  RETURN audit_id;
END;
$$;

COMMENT ON FUNCTION public.log_read_audit IS
  'Fase E.6 — Read-audit voor GDPR Art. 15 compliance. Roep aan vanuit data-laag bij SELECT op gevoelige resources (cliënt-detail, verzuim, etc.).';

-- ============================================================================
-- 5. Helpdesk-settings tabel (Fase G.8 prep)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.helpdesk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefoonnummer text,
  email_adres text,
  beschrijving text DEFAULT 'Hulp nodig? Neem contact op met je admin/eigenaar/directeur.',
  enabled boolean NOT NULL DEFAULT true,
  aanmaakdatum timestamptz NOT NULL DEFAULT now(),
  laatst_gewijzigd timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.helpdesk_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth kan helpdesk_settings lezen" ON public.helpdesk_settings;
CREATE POLICY "auth kan helpdesk_settings lezen"
  ON public.helpdesk_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth kan helpdesk_settings bewerken" ON public.helpdesk_settings;
CREATE POLICY "auth kan helpdesk_settings bewerken"
  ON public.helpdesk_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth kan helpdesk_settings toevoegen" ON public.helpdesk_settings;
CREATE POLICY "auth kan helpdesk_settings toevoegen"
  ON public.helpdesk_settings FOR INSERT TO authenticated WITH CHECK (true);

-- Seed default row (admin kan later updaten)
INSERT INTO public.helpdesk_settings (telefoonnummer, email_adres)
SELECT '+31-XXX-XXXXXX', 'admin@etfalkmaar.nl'
WHERE NOT EXISTS (SELECT 1 FROM public.helpdesk_settings);

COMMENT ON TABLE public.helpdesk_settings IS
  'Fase G.8 — Configureerbare helpdesk-contactinfo voor topbar Help-button modal. Singleton-pattern (1 row).';
