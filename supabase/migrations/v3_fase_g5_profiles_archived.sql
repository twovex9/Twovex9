-- v3 Fase G.5 — voeg `archived` kolom toe aan profiles voor deactivatie via Gebruikers-tab
-- User-keuze 28c: "Records behouden + gedeactiveerde profile blijft als FK; geen nieuwe acties; audit-trail intact"
--
-- Toegepast op productie 2026-05-15 via Supabase MCP apply_migration.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_archived_idx ON public.profiles (archived);

-- Geen RLS-wijziging nodig: bestaande "auth kan profiles ..." policies blijven werken.
-- Auth-guard.js zal in een vervolg-PR een check toevoegen die gearchiveerde users
-- direct uitlogt en doorstuurt naar login met melding "Account gedeactiveerd".
