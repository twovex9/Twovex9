-- v3 Fase E.7 — Enable Supabase Realtime op key tabellen
--
-- Per user-keuze #15: BS1 spiegelt BS2 WebSocket gedrag via Supabase Realtime channels.
-- Hierdoor ziet user B real-time wijzigingen van user A zonder page-refresh.
--
-- Werking:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.<naam>
--   → Supabase Realtime stuurt postgres_changes events naar subscribed clients
--
-- Toegevoegd voor:
--   - clienten (PII + audit-trail relevant)
--   - medewerkers (PII + audit-trail relevant)
--   - beschikkingen (financiële records)
--   - facturen (financiële records)
--   - incidenten (compliance-relevant)
--   - planning (scheduling-relevant)
--   - taken (workflow-relevant)
--   - beleidsdocumenten (admin-controlled)
--   - teams (org-structure)
--   - notification_types (admin-controlled)
--   - notifications (in-app meldingen - kritiek voor real-time bell-badge)
--
-- Toepassen via Supabase Studio SQL Editor.

-- Helper-function om idempotent toe te voegen aan publication
DO $do$
DECLARE
  tbl text;
  realtime_tables text[] := ARRAY[
    'clienten', 'medewerkers', 'beschikkingen', 'facturen',
    'incidenten', 'planning', 'taken', 'beleidsdocumenten',
    'teams', 'notification_types', 'notifications'
  ];
BEGIN
  -- Ensure publication exists
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH tbl IN ARRAY realtime_tables LOOP
    -- Check if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      -- Check if already in publication
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        RAISE NOTICE 'Added % to supabase_realtime publication', tbl;
      ELSE
        RAISE NOTICE 'Skipped % (already in publication)', tbl;
      END IF;
    ELSE
      RAISE NOTICE 'Skipped % (table does not exist)', tbl;
    END IF;
  END LOOP;
END
$do$;

-- Verify (run separately): SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';
