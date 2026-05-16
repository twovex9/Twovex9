# VOORTGANG — BS2 Beschikkingen-OVERZICHT → BS1 (100%, methodiek STAP 1-6)

> CONTINUÏTEITSDOC. Bij compactie: lees dit + `memory/methodology_bs2_reconciliatie.md`
> + `docs/bs2-sync/VOORTGANG-DASHBOARD.md`. User-eis: overzicht (151 beschikkingen
> + per stuk de 5 tabs) 100% exact in BS1, net als cliënten/medewerkers.

## Status
- ✅ Dashboard 1-op-1 BS2 (PR #189 merged) + drill-down-fix (PR #190, open).
- ✅ STAP 1 endpoints ontdekt (recorder) — 14 endpoints.
- ✅ STAP 2 volledige scrape KLAAR — `bs2-overzicht-full (3).json` (~2.9MB) in Downloads.
- ✅ STAP 3 inspect KLAAR (`scripts/inspect-overzicht.mjs`).
- 🔵 STAP 4 writer → STAP 5 reconciliatie (destructief, akkoord) → STAP 6 verify.

## STAP 1 — Endpoints (uit `bs2-overzicht-endpoints.json`, 14 stuks)
- Lijst/Details: `GET /api/dispositions?with[]=client&with[]=care_type&page=N&limit=15`
  (+ optioneel `filter[phases][N]`, `filter[care_types][N]`, `filter[trashed]=only`)
- Facturen: `GET /api/disposition-payments?with[]=disposition&filter[disposition]={id}`
- Tarieven: `GET /api/dispositions/{id}/rates`
- Notities: `GET /api/notes?with[]=user&filter[target][type]=disposition&filter[target][id]={id}`
- Audit: `GET /api/audit-logs?with[]=causer&filter[resource][type]=disposition&filter[resource][id]={id}`
- Lookups: `/api/care-types`, `/api/phases?filter[entity_target][type]=disposition`,
  `/api/clients?filter[with_trashed]=true&filter[hourly_type]=0&limit=1000`, `/api/users`
- AUTH = Laravel Sanctum bearer (GEEN JWT). Scrape-snippet kaapt de Authorization-
  header uit BS2's eigen request (`scripts/bs2-console-scrape-overzicht.js` v3),
  fetch met `credentials:'omit'` (wildcard-CORS), of BS2's eigen axios.

## STAP 2 — Scrape-resultaat (`bs2-overzicht-full (3).json`)
counts: **dispositions 151**, payments **956** (bij 135/151), rates **129**
(bij 129/151), notes **1** (bij 1/151), audit **1180** (bij 151/151),
care_types 6, phases 3, **http_fails 0**. (`trashed:151` = mislabel; de
`trashed=only`-filter gaf de normale set terug → 151 unieke actieve
beschikkingen = de overzicht-scope. De 4 verwijderde uit de oude
`bs2-dispositions-full.json` zijn niet kritiek voor het overzicht.)
Verdeling: fase Actief 89 / Verlopen 51 / In aanvraag 10 / In zorg 1;
status paid 124 / outstanding 27; declmethode ons 121 / manual 23 / wlz 7;
care_type Verblijf en behandeling 90 / Ambulant intern 35 / Gecombineerd 19 / WLZ 7.

## STAP 3 — Structuur (exacte velden, bron voor STAP 4-mapping)
**disposition top-level (28)**: id, name, monthly_amount, total_amount,
declaration_method, start_date, end_date, status, current_monthly_amount,
ambulatory_hours_per_week, stay_rate_day, ambulatory_rate_hourly, weekly_rate,
is_overdue, total_expected_amount, already_paid, already_declared,
not_yet_declared, out_standing_amount, current_total_amount_not_paid,
to_be_declared_current_month, outstanding_to_declare, created_at, updated_at,
deleted_at, __trashed + **client{id,name,first_name,last_name,client_number,
municipality{},referrer_name/phone/email,care_start_date,care_end_date,
location{id,name,color},phase{},is_not_declared_yet,...}** +
**care_type{id,name,tariff_type}** + **phase{id,name,slug,color,description,order}**.
- **payments** (Facturen): id, amount, invoice_number, disposition{volledig},
  is_overdue, status(paid|declared_pending|outstanding), paid_at, starts_at,
  ends_at, ons_message, created_at, updated_at, deleted_at.
- **rates** (Tarieven): id, disposition_id, effective_from, stay_rate_day,
  ambulatory_rate_hourly, ambulatory_hours_per_week, weekly_rate, change_reason,
  is_currently_effective, rate_description, created_at, updated_at.
- **notes** (Notities): standaard notes-vorm (id, body/content, user{}, ...);
  in BS2 vrijwel leeg (1 record totaal).
- **audit** (Audit): id, timestamp, action_type, resource_type, resource_id,
  ip_address, user_agent, context, old_values, new_values, causer{id,name,
  email,...}, resource{id,type,name}, created_at, updated_at.

## STAP 4-6 plan
4. `scripts/write-overzicht-full.mjs` (niet-destructief): vul/ververs de
   dashboard-tabellen `bs2_dispositions`(151) + `bs2_disposition_payments`(956)
   uit deze rijkere scrape, en zet de VOLLEDIGE ruwe tabs (payments/rates/
   notes/audit) per beschikking in `raw`/jsonb (100% behoud). Nieuwe tabellen
   `bs2_disposition_rates`, `bs2_disposition_audit` (additief).
5. Reconciliatie BS1 `beschikkingen`(134) → 151 BS2-set + sub-tabs, mét
   backup-tabel + atomair + **USER-AKKOORD** (destructief). Daarna dashboard
   drill-down 100% consistent (89 Actief = 89, niet 88).
6. Verifieer veld-voor-veld vs BS2 + dashboard/drill-down 2 CLEAN RUNS.

## Bestanden
`scripts/bs2-console-rec-overzicht.js` (STAP1), `bs2-console-scrape-overzicht.js`
v3 (STAP2), `inspect-overzicht.mjs` (STAP3). Branch `feature/v3-dashboard-drilldown-fix`.
