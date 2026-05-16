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

## STAP 4 — KLAAR ✅ (niet-destructief)
`scripts/write-overzicht-full.mjs` uitgevoerd. Geschreven (alleen bs2_*-tabellen,
beschikkingen/facturen ONAANGEROERD): **bs2_dispositions 151** (raw =
volledige disposition incl. alle tabs = 100% behoud), **bs2_disposition_payments
956**, **bs2_disposition_rates 129**, **bs2_disposition_audit 1180** (migration
`bs2_overzicht_rates_audit_tables`). Dashboard-KPI's geverifieerd nog steeds
EXACT: 89/10/8/€600.738,98/€63.503,64/€664.242,62/€764.204,59·67/€273.614,13·11.

## STAP 5 — reconciliatie gebruikers-tabellen (DESTRUCTIEF — vereist USER-AKKOORD)
Doel: BS1 `beschikkingen` (134, per-cliënt) → exact de **151 BS2-overzicht-set**
met `data.bs2_scrape` = volledige ruwe disposition + alle 5 tabs (100% behoud),
zodat `beschikkingen.html`-overzicht + drill-down + detail-tabs 1-op-1 = BS2
(Actief 89 = 89, niet 88). Facturen ← de 956 payments.
Atomair: `BEGIN; CREATE TABLE _beschikkingen_overzicht_bak AS SELECT *; ... ;
DELETE; INSERT ... ; COMMIT;`. CHECK's respecteren (betalings_status ∈
{betaald,outstanding}; fase ∈ {Actief,In aanvraag,In zorg,Verlopen}). FK-kinderen
(beschikking_tarieven/notities/audit) omhangen of vullen uit bs2_*-tabellen.
NIET uitvoeren zonder expliciet "ja, akkoord".

## STAP 6 — verifiëren
beschikkingen-telling = 151, fase-verdeling = BS2 (89/10/51/1), drill-down 89,
detail-tabs (Details/Facturen/Tarieven/Notities/Audit) tonen BS2-data,
2 CLEAN RUNS, veld-voor-voor-veld controle-beschikking.

## Bestanden
`scripts/bs2-console-rec-overzicht.js` (STAP1), `bs2-console-scrape-overzicht.js`
v3 (STAP2), `inspect-overzicht.mjs` (STAP3). Branch `feature/v3-dashboard-drilldown-fix`.

## STAP 5 + 6 — KLAAR ✅ (2026-05-16)
Reconciliatie atomair geslaagd (3 CHECK/NOT-NULL-fixes, telkens veilig teruggerold).
Backups: `_beschikkingen_overzicht_bak`(134) `_facturen_overzicht_bak`(911).
Resultaat: beschikkingen **151** (alle met `data.bs2_scrape` = volledige ruwe
disposition incl. 5 tabs = 100%), facturen **956**, beschikking_tarieven 129,
beschikking_notities 1, beschikking_audit_log 1180. fasen Actief 89/Verlopen 51/
In aanvraag 10/In zorg 1; betalings_status betaald 124/outstanding 27.
Dashboard-KPI ongewijzigd exact (89/10/8/EUR764.204,59). **Drill-down nu 100%
consistent: dashboard 89 = beschikkingen fase=Actief 89**. Controle-beschikking
fasehuis veld-voor-veld = BS2. Maps: status paid->betaald/outstanding->outstanding;
declmethode ons->ONS/manual->Handmatig/wlz->WLZ; tariff weekly->week/daily->dag/
hourly->uur; audit VIEW->bekijken/CREATE->aanmaken/UPDATE+ARCHIVE->bewerken.
Nog te doen: live 2 CLEAN RUNS (overzicht 151 + drilldown 89 + detail-tabs).
