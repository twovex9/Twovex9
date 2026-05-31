# 66 — Taak-deadline herinneringen (dagelijks signaal in de app + push)

**Status:** ✅ AF & LIVE — 2026-05-31
**Wens (user, spraakbericht 2026-05-31):** "Aan het kopje Taken: vier dagen van tevoren elke
dag een herinnering / signaal in de app dat je taak gaat verlopen. Hoeft geen e-mail te zijn,
wel een signaal (ook op je telefoon)."

## User-keuzes (AskUserQuestion)
- **Venster:** melding op 4, 3, 2 en 1 dag vóór de deadline ÉN op de deadlinedag zelf
  → `deadline in [vandaag .. vandaag+4]` (5 dagen). Geen herinneringen ná de deadline.
- **Tijdstip:** dagelijks 08:00 NL.
- Defaults: ontvanger = de toegewezen medewerker; kanaal = in-app bel/Meldingen-tab **én**
  telefoon-push; idempotent (nooit 2× dezelfde taak op dezelfde dag).

## Wat er gebouwd is (alles in Supabase — geen frontend-wijziging nodig)
- **`public.taken_deadline_herinneringen(p_dry_run boolean)`** — PL/pgSQL SECURITY DEFINER.
  Vindt taken (niet voltooid/archived, deadline in venster, toegewezen + gekoppeld profiel),
  schrijft een `public.notifications`-rij type `taak_deadline_herinnering` met dag-bewuste tekst
  ("verloopt vandaag/morgen/over N dagen" + datum). Idempotent per kalenderdag (NL).
- **pg_cron job `taken-deadline-herinnering-dagelijks`** — `0 6 * * *` (06:00 UTC = 08:00 NL
  zomertijd), roept de functie aan. Zelfde patroon als `notify_vervallen_wettelijk_verlof`.
- **Telefoon-push (best-effort):** `pg_net` + Edge Function **`taken-herinnering-push`**
  (`verify_jwt=false`, cron-secret-gated, VAPID uit `private_app_config`). De functie triggert ná
  de inserts één `net.http_post` met de nieuwe notification-ids; de Edge Function pusht gericht
  naar de `push_subscriptions` van de toegewezen gebruiker. **In een exception-block** — een
  push-storing raakt de in-app meldingen nooit.
- Bestanden: `supabase/taken_deadline_herinneringen_pgcron.sql`,
  `supabase/functions/taken-herinnering-push/index.ts`.

De notification-bell (web) en de Meldingen-tab (mobiel) tonen het nieuwe type automatisch
(generieke rendering) — daarom géén frontend-code nodig.

## Geverifieerd (2026-05-31)
- Dry-run + 2 echte runs: venster/uitsluitingen correct (voltooid + buiten-venster overgeslagen),
  idempotent (2e run = 0 nieuw), teksten correct per dag-variant.
- Push-pipeline end-to-end: SQL → pg_net → Edge Function → HTTP 200
  `{notificaties:1, push_verstuurd:0}` (0 omdat er nog 0 push_subscriptions zijn).

## Follow-ups (niet kritiek)
- **Fysieke push-aflevering** is pas testbaar zodra een medewerker de PWA installeert + push
  toestaat (nu 0 `push_subscriptions`). Tot dan werkt de in-app bel/Meldingen-tab volledig.
- **DST:** cron staat op een vaste UTC-tijd → in wintertijd komt de melding 07:00 NL i.p.v. 08:00
  (bewust geaccepteerd, conform de verlof-cron). Eventueel later twee jobs of een NL-tijdcheck.
- **Te-laat-taken** krijgen géén herinnering (user koos "t/m de dag zelf"). Kan later optioneel.
