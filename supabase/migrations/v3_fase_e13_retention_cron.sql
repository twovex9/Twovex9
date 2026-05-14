-- v3 Fase E.13 — Retention-policy daily cron (pg_cron)
--
-- Doel: dagelijks `gdpr_retention_run_v1()` aanroepen om oude records
-- automatisch te archiveren/verwijderen per retention-policy (per user-keuze #24).
--
-- Retention-policies (uit mijn-gegevens.html documentation):
--   - Planning: 24 maanden bewaard → daarna gearchiveerd
--   - Audit-logs (beschikking_audit_log): 5 jaar → daarna verwijderd
--   - Notificatie-geschiedenis: 12 maanden → daarna verwijderd
--   - Personeelsdossier: 7 jaar (fiscaal + arbeidsrecht) — bewaard
--   - Verzuim/Medisch: 20 jaar (Arbo) — bewaard
--
-- Voorwaarde: pg_cron extension enabled op Supabase Pro (al ingeschakeld in Fase 0).
-- Toepassen via Supabase Studio SQL Editor.

-- Enable pg_cron als nog niet enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily retention run om 03:00 NL-tijd (= 02:00 UTC in winter, 01:00 UTC in zomer)
-- Voor eenvoud: 02:00 UTC (acceptabel voor productie)
SELECT cron.schedule(
  'gdpr-retention-daily',
  '0 2 * * *',  -- elke dag om 02:00 UTC
  $$SELECT public.gdpr_retention_run_v1()$$
);

-- Verify schedule (run manueel om te checken):
--   SELECT * FROM cron.job WHERE jobname = 'gdpr-retention-daily';

-- Unschedule (indien nodig):
--   SELECT cron.unschedule('gdpr-retention-daily');

COMMENT ON EXTENSION pg_cron IS 'Fase E.13 — schedule daily retention enforcement';
