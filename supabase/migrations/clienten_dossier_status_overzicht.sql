-- ============================================================
-- Cliënten-overzicht: dossier-status indicator ("rood puntje")
--
-- Eis eigenaar (spraakmemo 2026-06-11 16:30): op de cliënten-lijst moet
-- — net als bij de medewerkers — in één oogopslag zichtbaar zijn wanneer
-- de documentatie/het dossier van een cliënt NIET compleet is. Dit moet
-- ook voor de rol medewerker zichtbaar zijn.
--
-- Bron van waarheid = public.client_dossier_issues (gevuld door de
-- dagelijkse cron client_dossier_controle). Dat is exact wat je in het
-- dossier ziet als je op de cliënt klikt. Deze RPC levert per cliënt een
-- compacte samenvatting (open_count + heeft_rood) zodat het overzicht in
-- één call alle puntjes kan kleuren.
--
-- Gating IDENTIEK aan de per-cliënt lees-RPC client_dossier_issues_voor_client:
-- public.client_zorg_toegang(client_id). Daardoor matcht het puntje 1-op-1 met
-- wat de gebruiker in het dossier zelf zou zien (office-rollen + HR + admin
-- zien alles; medewerker ziet de cliënten van zijn locatie(s) + gekoppelde
-- cliënten — exact dezelfde set als de clienten-RLS op het overzicht).
--
-- Idempotent. Uitvoeren: node scripts/db-exec.mjs --file supabase/migrations/clienten_dossier_status_overzicht.sql
-- ============================================================

create or replace function public.client_dossier_status_overzicht()
returns table(client_id text, open_count int, heeft_rood boolean)
language sql stable security definer
set search_path to 'public'
as $$
  select i.client_id,
         count(*)::int                  as open_count,
         bool_or(i.ernst = 'rood')       as heeft_rood
    from public.client_dossier_issues i
   where i.opgelost_op is null
     and public.client_zorg_toegang(i.client_id)
   group by i.client_id;
$$;

revoke all on function public.client_dossier_status_overzicht() from public, anon;
grant execute on function public.client_dossier_status_overzicht() to authenticated;
