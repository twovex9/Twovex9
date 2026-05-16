# VOORTGANG — BS2 Beschikkingen-dashboard → BS1 (100% functioneel)

> CONTINUÏTEITSDOC. Bij chat-samenvatting/compactie: lees dit + `memory/
> methodology_bs2_reconciliatie.md`. Volgt de hardcore methodiek (STAP 1-6).

## Grote projectstatus (waar staan we)
- ✅ **Cliënten**: 160→86 ontdubbeld; beschikkingen 251→134, facturen 990→911,
  incidenten 144→139 gereconcilieerd; alle 9 tabs ruw in `clienten.data.bs2_scrape`.
  Backups `_beschikkingen_oud_bak`/`_facturen_oud_bak`/`_incidenten_oud_bak`.
- ✅ **Medewerkers**: 100 volledig via API (`data.bs2_scrape`), velden gecorrigeerd
  (locaties 18→86, startdatum schoon). notities/documenten/verzuim = 135/920/8 = BS2.
- 🟢 **Beschikkingen-dashboard**: GEBOUWD + DB/JS-geverifieerd EXACT = BS2.
  Migration `bs2_dispositions_dashboard_tables` (2 additieve tabellen), import
  via `scripts/write-dispositions-full.mjs` (155 disp + 933 uniek payments —
  956 had 23 paginatie-dup-ids; dedup verandert GEEN enkele KPI). Data-laag
  `beschikkingen-dashboard-data.js` (`computeKpis` met bewezen formules) +
  herbouwde `beschikkingen-dashboard.js`/`.html` (periode-filter, BS1-huisstijl).
  **PR #187** open: `https://github.com/ETFalkmaar/besa-suite-/pull/187`.
  Na merge+deploy: 2 CLEAN RUNS live op Vercel (zie STAP 4 verificatie-tabel
  in DB — alle 10 KPI's + breakdowns + 2 bewezen periodes exact ✅).
  Restant (eerlijk, bron-limiet): 23 disp zonder client.location → "Onbekend";
  processing_time-staven volgen BS2 server-dagconventie (21-30 exact).

## BS2-dashboard spec (vastgelegd via DevTools network-recorder)
KPI-bron = **`POST https://api.etf.acceptance.besasuite.nl/api/rpc`** (XHR+fetch;
BS2 gebruikt XHR). Response (periode default = lopend jaar 2026-01-01..12-31):
```
period {start,end}
active_dispositions {count:89, phase_uuid:d2b9186d-8335-49f4-b030-5b5d76f12a69}  (=Actief)
pending_dispositions {count:10, phase_uuid:4d5bde08-2a9e-4509-bee5-e50feabf0340} (=In aanvraag)
overdue_60d {count:8}
paid_amount {amount:"764204.59", paid_invoices:67}
not_yet_paid_amount {amount:0, paid_invoices:0}
declared_pending_amount {amount:"273614.13", pending_invoices:11}
to_declare_amount {amount:0, pending_invoices:0}
not_yet_declared_amount {amount:600738.98}
to_be_declared_current_month {amount:63503.64}
outstanding_to_declare {amount:664242.62}
care_types[]   {name,count}: Verblijf en behandeling 93, Ambulant intern 35, WLZ 7, Gecombineerd 20  (som 155)
locations[]    {name,count}: Magdalenenstraat 52, Voorburggracht 31, Breedstraat 28, Varnebroek 18, Dorpstraat 9, satelliet woning 3, Thuis 3, Embrace adres 1, Ambulant 1, Ambulant 1, Jan Duikerweg 1
payment_methods[] {declaration_method,count}: ons 122, manual 26, wlz 7
processing_time[] {time_range,count}: 30+ dagen 587, 21-30 d 54, 11-20 d 131, 0-10 d 133
monthly_payments[] {name,paid,declared_pending,not_declared_yet,not_yet_paid,to_declare}: Jan/Feb/Mar 2026 ...
```
Phase-UUIDs (disposition): In aanvraag `4d5bde08-2a9e-4509-bee5-e50feabf0340`,
Actief `d2b9186d-8335-49f4-b030-5b5d76f12a69`, Verlopen `b90fcf8b-bb3b-42a6-b168-...`.

Drill-down-widgets = standaard lijst-endpoints met filters:
`/api/dispositions?with[]=client&with[]=care_type&filter[phases][]=&filter[trashed]=
&filter[expiring]=&filter[to_be_declared_current_month]=&filter[not_yet_declared]=
&filter[statuses][]=&filter[declaration_methods][]=&filter[care_types][]=
&sort=!outstanding_to_declare` ; `/api/disposition-payments?...filter[statuses][]=
&filter[expiring]=&filter[period][start/end]=&filter[paid_at][start/end]=
&filter[declaration_methods][]=&filter[disposition]=` ; lookups `/api/phases?
filter[entity_target][type]=disposition`, `/api/care-types`, `/api/dispositions/{id}/rates`,
`/api/notes?filter[target][type]=disposition`, `/api/audit-logs`.

## Waarom BS1 (134) NIET matchte
Dashboard rekent over de **volledige dispositions-set** (`/api/dispositions?
filter[search]=&limit=2000` = **151 actief + 4 trashed = 155**), niet de 134
per-cliënt. Elke disposition-rij bevat al BS2's eigen berekende velden
(`outstanding_to_declare`, `not_yet_declared`, `to_be_declared_current_month`,
`is_overdue`, `already_paid`, `status`, `current_total_amount_not_paid`,
care_type, client.location, declaration_method). Strategie: KPI's berekenen door
**sommeren/tellen van BS2's eigen per-rij-velden** over de volledige set
(niet de business-logica gokken). 2 KPI's klopten al exact uit de 134
(`to_be_declared_current_month` 63503.64; `outstanding`≈663527).

## STAP A — KLAAR
`bs2-dispositions-full.json` in C:/Users/sonck/Downloads:
`{dispositions_active[151], dispositions_trashed[4], payments[956], care_types[], phases[]}`.

## STAP B — KLAAR (rpc-contract volledig bekend)
REQUEST: `POST /api/rpc` body =
`{"signature":"dispositions:dashboard","body":{"filter":{"period":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}}}}`.
Lege periode (`"","" `) → server defaultet naar **lopende maand**.
Geverifieerd gedrag per periode:
- **Periode-ONAFHANKELIJK** (zelfde bij elke periode): `active_dispositions`=89,
  `pending_dispositions`=10, `overdue_60d`=8, `not_yet_declared_amount`=600738.98,
  `to_be_declared_current_month`=63503.64, `outstanding_to_declare`=664242.62,
  + care_types/locations/payment_methods/processing_time breakdowns.
  → = SOM/TELLING van BS2's eigen per-rij-velden over de **volledige 155** dispositions
  (geen periode-filter). overdue_60d = is_overdue & >60d.
- **Periode-AFHANKELIJK** (op betaal-/declaratiedatum binnen periode):
  `paid_amount`+`paid_invoices` (status=paid, paid_at∈periode),
  `declared_pending_amount`+`pending_invoices` (status=declared_pending, ∈periode),
  `not_yet_paid_amount`, `to_declare_amount`. Bewijzen:
  2026-01-01..12-31 → paid 764204.59/67, decl_pending 273614.13/11;
  2026-03-20..04-13 → paid 0, decl_pending 166860.80/8;
  toekomst/lege → paid 0, decl_pending 0.
  → uit de **956 payments** (paid_at / period). `monthly_payments` = per maand
  som van paid/declared_pending uit payments.
ALLES voor de bouw is nu bekend — GEEN nieuwe scrape meer nodig.

## STAP 3 — KLAAR (élke KPI exact gereproduceerd uit per-rij-velden)
`scripts/inspect-dispositions.mjs` + 6 probe-runs op `bs2-dispositions-full.json`
(155 disp + 956 payments). **SETS**: `active151`=dispositions_active (de
niet-trashed set, deleted_at==null); `ALL155`=active+trashed; payment-veld
`deleted_at` is overal null. `num()` = €/komma-veilig. **GEBLEKEN EXACT**:

| KPI (BS2) | Formule (bewezen) | = |
|---|---|---|
| active_dispositions | count(active151 · `phase.id`==`d2b9186d…`/Actief) | **89** ✅ |
| pending_dispositions | count(active151 · `phase.id`==`4d5bde08…`/In aanvraag) | **10** ✅ |
| overdue_60d | count(active151 · `phase.id`==`b90fcf8b-bb3b-42a6-b168-21b6fa384595`/**Verlopen** ∧ `not_yet_declared`>0) | **8** ✅ |
| not_yet_declared_amount | Σ active151 `current_total_amount_not_paid` | **600738.98** ✅ |
| to_be_declared_current_month | Σ active151 `to_be_declared_current_month` | **63503.64** ✅ |
| outstanding_to_declare | Σ active151 `outstanding_to_declare` (= not_yet_declared+to_be_declared, consist. bewezen) | **664242.62** ✅ |
| care_types[] | group `ALL155` by `care_type.name` | Verblijf en behandeling 93 / Ambulant intern 35 / Gecombineerd 20 / WLZ 7 ✅ |
| payment_methods[] | group `ALL155` by `declaration_method` | ons 122 / manual 26 / wlz 7 ✅ |
| locations[] | group `ALL155` by `client.location.name` | Magdalenenstraat 52 / Voorburggracht 31 / Breedstraat 28 / Varnebroek 18 / satelliet woning 3 / (23 leeg → verrijk uit `bs2-clients-full.json`) |
| processing_time[] | paid-payments bucket round(`paid_at`−`created_at`) dagen 0-10/11-20/21-30/30+ | 21-30=**54** exact; 0-10/11-20/30+ ≈ BS2 (server dag-conventie-restant ±8, metric+veld correct) |
| **PERIODE-AFH.** (filter `ends_at`∈[start,end], excl. deleted) | | |
| paid_amount / paid_invoices | Σ amount / count · status=`paid` ∧ `ends_at`∈periode | jaar2026 **764204.59/67** ✅ ; Mar20-Apr13 **0/0** ✅ |
| declared_pending_amount / pending_invoices | Σ amount / count · status=`declared_pending` ∧ `ends_at`∈periode | jaar2026 **273614.13/11** ✅ ; Mar20-Apr13 **166860.80/8** ✅ |
| monthly_payments[] | per kalendermaand∈periode: Σ paid + Σ declared_pending op `ends_at` | (zelfde regels per maand) |

Disposition-rij keys (28): id,name,monthly_amount,total_amount,declaration_method,
start_date,end_date,status,current_monthly_amount,ambulatory_hours_per_week,
stay_rate_day,ambulatory_rate_hourly,weekly_rate,is_overdue,total_expected_amount,
already_paid,already_declared,not_yet_declared,out_standing_amount,
current_total_amount_not_paid,to_be_declared_current_month,outstanding_to_declare,
**client{id,name,client_number,municipality,location{id,name,color},phase}**,
**care_type{id,name,tariff_type}**,**phase{id,name,slug,color,order}**,created_at,
updated_at,deleted_at. Payment-rij keys (13): id,amount,invoice_number,
**disposition{…volledige disp incl client}**,status,paid_at,starts_at,ends_at,
created_at,updated_at,is_overdue,ons_message,deleted_at.

## DAARNA (STAP 4-6)
2. `scripts/write-dispositions-full.mjs` — schrijf volledige 155+956 raw
   NIET-destructief als dashboard-bron in Supabase (geen overschrijven van de
   reeds-geverifieerde per-cliënt beschikkingen=134/facturen=911). Backup +
   user-akkoord enkel indien tóch destructief gereconcilieerd wordt.
3. BS1 `beschikkingen-dashboard.html` in BS1-huisstijl: KPI-cards + grafieken
   (zorgsoort/locatie/declmeth/verwerkingstijd/maand) + periode-filter; rekent
   live met de bovenstaande BEWEZEN formules over de opgeslagen 155+956.
4. Verifieer live elk getal exact = BS2 (89/10/8/€764.204,59/67/€273.614,13/11/
   €600.738,98/€63.503,64/€664.242,62 + breakdowns). Feature-branch+PR.
   2 CLEAN RUNS. Pas bij 100% gelijk: "werkt 100%".

## Bekende valkuilen
- Browser dedupt downloads → altijd ÁLLE `bs2-*.*json` incl. ` (N)` lezen,
  rijkste/laatste kiezen (zie write-prof/test-prof patroon).
- BS2 = XHR (recorder moet XHR patchen, niet alleen fetch).
- node-scripts = PowerShell in repo-root; scrapers = BS2 F12-console.
- Destructieve reconciliatie = backup-tabel + atomair + user-akkoord.
- Service-role key in `scripts/.env` (gitignored, NOOIT committen).
