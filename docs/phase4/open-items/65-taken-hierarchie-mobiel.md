# 65 — Taken-hiërarchie: mobiele app (vervolg op web)

**Status**: ✅ AF & LIVE (mobiel PR #5, 2026-05-31) — live getest op futureflow-mobile

## Context
De web-Taken kreeg een hiërarchisch zichtbaarheidsmodel + gespreksdraad +
bijlagen + automatische meldingen (zie feature `taken-hierarchie`). Het
DB-fundament (RLS-policies, `taken_*`-functies, `taak_comments`,
`taak_bijlagen`, bucket `taak-bijlagen`, meldingen-trigger) staat los van
de frontend en geldt dus al voor élke client — óók de mobiele app.

## Wat nog moet in `Future Flow-mobile`
1. **Mijn taken** tonen (al deels: `src/lib/data/taken.ts`) + status zetten
   ("In behandeling" / "Voltooid") door de uitvoerder → schrijft `status_bs2`.
2. **Gespreksdraad** lezen/schrijven (`taak_comments`) + **bijlage** uploaden
   (`taak_bijlagen` + bucket `taak-bijlagen`) — camera/bestand.
3. **Melding ontvangen** bij toewijzing + bij voltooiing (notifications-tabel
   wordt al server-side gevuld via trigger; push via edge-function `send-push`
   kan erop aangesloten worden).
4. Toewijzen vanuit mobiel: gebruik RPC `taken_toewijsbare_mw_ids()` (gelijk
   niveau of lager).

## Aandachtspunten
- RLS is al actief; de mobiele client krijgt automatisch alleen de taken die
  de ingelogde gebruiker mag zien. Niets extra nodig voor afscherming.
- `aangemaakt_door_id` = `auth.users.id` (maker, meldings-ontvanger);
  `toegewezen_aan_id` = `medewerkers.id` (uitvoerder, rang-bepalend).
