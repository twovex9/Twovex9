# Item 56 — Sprint 14: GDPR retention + DSR flow

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S14 in `../v2-master-plan.md`
**Gerelateerd**: items 39 (RLS audit), 40 (GDPR Art. 9 verzuim)

## Wat is gedaan

Twee GDPR-features volgens master-plan S14:
1. **Retention policy** — automatische cleanup van oude data (Art. 5 storage limitation)
2. **DSR flow** — `mijn-gegevens.html` pagina (Art. 15 recht op inzage + Art. 20 dataportabiliteit)

### Database (Supabase MCP migration)

#### `public.gdpr_retention_run_v1()` — retention SQL

Plpgsql function, `SECURITY DEFINER`, alleen aanroepbaar door `service_role`. Wat het doet:

| Wat | Cutoff | Actie |
|---|---|---|
| Planning rijen | > 24 maanden | archived=true (geen delete) |
| beschikking_audit_log | > 60 maanden | DELETE |
| notification_history | > 12 maanden | DELETE |

Returnt JSONB met counts per categorie.

#### `public.gdpr_my_data_export()` — DSR query

Plpgsql function, `SECURITY DEFINER`, aanroepbaar door alle ingelogde users. Returnt JSONB met:
- `profile` — public.profiles rij van current user
- `medewerker` — gekoppeld medewerker-record (via profile.medewerker_id)
- counts: medewerker_notities, medewerker_documenten, verzuim_perioden, planning_shifts

#### `public.gdpr_retention_log` tabel

Per-run logging van retention-output. RLS: select alleen admin.

#### `public.gdpr_retention_run_and_log(by_text)` — wrapper

Roept `gdpr_retention_run_v1()` aan + logt resultaat naar `gdpr_retention_log`.

### Geen pg_cron (Supabase managed)

`pg_cron` v1.6.4 is beschikbaar maar niet pre-installed. Installatie vereist Supabase Dashboard > Database > Extensions. Voor v2 documenteer ik 3 trigger-opties:

1. **Manueel** — admin runt elke maand `select public.gdpr_retention_run_and_log('manual');` in SQL Editor
2. **External cron** — Vercel-cron of GitHub Actions schedule die de RPC aanroept via service_role
3. **pg_cron** — eenmalige enable via dashboard, dan `select cron.schedule('gdpr-retention', '0 3 1 * *', $$select public.gdpr_retention_run_and_log('cron')$$);`

### DSR pagina (`mijn-gegevens.html` + `.js`)

Self-contained pagina met simpele topbar (geen full nav — focus op de inhoud). Onder Instellingen submenu te koppelen in v3.

**Content**:
- Samenvatting van eigen gegevens (12 cards: naam, email, rol, functie, fase, counts etc.)
- "Download mijn data (JSON)" knop → roept `gdpr_my_data_export()` aan + download als blob
- "Vernieuwen" knop
- Rechten-uitleg (Art. 15/16/17/20/21)
- Bewaartermijnen uitleg (gekoppeld aan retention-functies)

**Styles**: nieuwe `.mijn-gegevens-section`, `.mijn-gegevens-grid`, `.mijn-gegevens-card`, `.mijn-gegevens-rights`.

### Files

- Migration `sprint_14_gdpr_retention_dsr` (Supabase MCP)
- `mijn-gegevens.html` (nieuw)
- `mijn-gegevens.js` (nieuw, ~100 regels)
- `styles.css` — `.mijn-gegevens-*` classes (~70 regels)

## Test plan

- [ ] CI groen
- [ ] Vercel deploy slaagt
- [ ] `/mijn-gegevens.html` toont eigen profiel + medewerker + counts
- [ ] Download-knop downloadt geldige JSON-file
- [ ] Vernieuwen-knop herlaadt data
- [ ] Migration: `select public.gdpr_retention_run_v1();` (alleen admin) returnt JSONB met 0 rows op huidige stand (geen data > cutoff)

## Acceptance (master-plan S14)

- ✅ Retention SQL-function met cutoffs per data-type
- ✅ DSR pagina met inzage + download
- ✅ Logging-tabel + wrapper voor cron-integratie
- ⏳ pg_cron schedule (defer naar v3 als admin enable't)

## Status update bij merge

Bij merge: master-plan S14 → ✅ DONE + PR-nummer. Direct start Sprint 15 (vrije tekst safeguards verzuim, 2u).
