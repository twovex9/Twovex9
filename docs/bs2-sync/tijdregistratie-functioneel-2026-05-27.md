# Tijdregistratie + Urendeclaratie + Budget — BS2 functioneel model — 2026-05-27

Bron: HAR-scrape `etf.acceptance.besasuite.nl.har` (150 calls, 31 unieke
endpoints, 9 write-ops) + Claude-in-Chrome UI-rapport (8-stappen scrape
met user-bevestigde write-acties op BS2-sandbox). BS2 = autoritatief
voor wat we 1-op-1 overnemen. Voor de gaten die BS2 mist (Override,
Agenda, Achterstand-onderscheid, Excel-zichtbaarheid, Confirm-dialoog)
is BS1 leidend per de user-tekst van 2026-05-27. **Bindend contract**
voor PR #2 t/m #7.

## 1. Endpoints (BS2) — 31 unieke

### Tijdregistratie (werkuren)

- `GET /api/time/summary` — overzichtspagina-data (totalen per medewerker, entries).
- `PATCH /api/time/bulk-update` — werkuren wijzigen (bulk-payload).
- `GET /api/clients-for-employee` — picker cliënten in werkuren-modal.
- `GET /api/labels?page=N&limit=15` (+ `filter[search]`) — labels-lijst.

### Labels (CRUD)

- `GET /api/labels` — lijst, paginated.
- `GET /api/labels/{uuid}` — detail.
- `POST /api/labels` — aanmaken (`{name, description}`) → 201.
- `PATCH /api/labels/{uuid}` — wijzigen (`{name, description}`) → 200.
- `DELETE /api/labels/{uuid}` → 204 (**HARD DELETE**, geen archief in BS2).

### Budgettering

- `GET /api/weekly-budgets` — week-budgetten lijst.
- `GET /api/clients/weekly-budgets/summary` — totaal-overzicht per cliënt.
- `PATCH /api/clients/{client_uuid}/weekly-budgets/{budget_uuid}` —
  cel update (`{planned_hours:"6.5", year:"2026"}`). `planned_hours`
  en `year` als STRING in BS2.

### Urendeclaraties

- `GET /api/monthly-declarations` — lijst declaraties per maand.
- `POST /api/rpc` met `{signature:"hour_declaration_details", body:{client_id, year, month}}` —
  detail (Uurverantwoording-modal). BS2 gebruikt een RPC-laag voor
  complexe queries.
- Excel-export per cliënt-rij = signed-URL naar S3 met format
  `MonthlyHourDeclaration_<NAAM>_<YYYY>_<MM>_local.xlsx`. **In scrape gaf
  S3 503** (BS2-bug); URL-structuur wel duidelijk.

### Maand-vergrendeling (globaal, niet per medewerker)

- `GET /api/locked-months/check` — checkt of huidige maand vergrendeld is.
- `POST /api/locked-months` — vergrendel (`{year:2026, month:5}`) → 201.
- `DELETE /api/locked-months?year=2026&month=5` → 200.

Payload **bevat geen `employee_id`** → vergrendeling is GLOBAAL per
year+month, zoals Pauline-eis uit user-tekst.

### Beschikkingen

- `GET /api/dispositions?with[]=client&with[]=care_type&filter[phases][0]=…&filter[care_types][0]=…&page=1&limit=15`
- `GET /api/dispositions/{uuid}?with[]=client&with[]=care_type`
- `GET /api/dispositions/{uuid}/rates?page=1&limit=15` — tarieven-historie.
- `GET /api/disposition-payments?with[]=disposition&filter[disposition]=…` — betalingen.
- `GET /api/care-types` — 6 zorgsoorten.
- `GET /api/phases` — beschikking-fasen.

### Ondersteunend

- `GET /api/users/current` — huidige user.
- `GET /api/users` — alle users.
- `GET /api/notes`, `GET /api/notifications`, `GET /api/audit-logs`
- `POST /api/broadcasting/auth` — Pusher websockets voor real-time updates.
- `GET /api/incidents`, `GET /api/announcements`

## 2. Werkuur (time-entry) — datamodel uit `time_entries[]` in `PATCH /api/time/bulk-update`

```
{
  id: uuid,
  date: "2026-05-01",
  time_from: "08:00",
  time_to: "17:05",
  description: string,
  label: { id?: uuid } | {},      // leeg-object = geen label
  client: { id: uuid }
}
```

**Velden in de bulk-update-payload (geverifieerd):** id, date,
time_from, time_to, description, label{}, client{id}.

**Niet in payload (maar wel in tabel-view):** medewerker (= de actieve
user), duur (`time_to − time_from`), dienst (mogelijk uit een ander
endpoint).

Pseudo-veld **`vergrendeld`** ontstaat door check tegen `locked_months`-
tabel — staat NIET op de time-entry zelf.

## 3. Label — datamodel (minimal in BS2)

```
{
  id: uuid,
  name: string,
  description: string | null,
  created_at: timestamp,
  updated_at: timestamp
}
```

**BS2 mist:** kleur, volgorde, archief/restore — alleen `name` + `description`
(geverifieerd in `POST /api/labels` payload). BS1 had al `archived`-
kolom + archive-flow — **wij behouden die (BS1 is hier rijker)**.

## 4. Budget — datamodel

```
GET /api/weekly-budgets → [
  { id: uuid, client_id: uuid, week_number: int, year: int, planned_hours: numeric, … }
]
PATCH /api/clients/{client_uuid}/weekly-budgets/{budget_uuid}
  body: { planned_hours: "6.5", year: "2026" }
```

Eén rij per cliënt × jaar × week. `planned_hours = 0` betekent "geen
budget". Filter op zorgsoort: BS2 toont ALLE cliënten in de
budget-pagina, niet alleen Ambulant (verschillend van user-tekst
"per cliënt die een Ambulante beschikking heeft" — wij houden dit
breed conform BS2; UI-warning kan op niet-Ambulant cliënten).

## 5. Urendeclaratie — datamodel + berekeningen

Per cliënt × jaar × maand komt er een declaratie-rij. Velden uit
`GET /api/monthly-declarations`:

```
{
  client: { id, naam, locatie, … },
  year, month,
  disposition: { id, zorgsoort, tarief_eur, … },
  budget_uren: numeric,         // som van weekly-budgets in die maand
  registered_uren: numeric,     // som van werkuren in die maand
  tarief_eur: numeric,
  bedrag: numeric (= registered_uren × tarief_eur),
  status: "onder budget" | "op budget" | "boven budget",
  is_locked: bool               // afgeleid uit /api/locked-months
}
```

Het "Uurverantwoording"-detail (modal) komt via `POST /api/rpc` met
signature `hour_declaration_details` en body `{client_id, year, month}`.

## 6. Beschikking — relevante velden voor Achterstand vs Lopende Maand

Uit `GET /api/dispositions/{uuid}`:

```
{
  id, name, client{}, care_type{},
  declaratie_methode: "ONS" | "...",
  start_date, end_date,
  hourly_rate / day_rate,
  fase, ...
  totals: {
    ontvangen: numeric,         // betaald totaal
    te_declareren: numeric,     // totaal openstaand
    nog_niet_gedeclareerd: numeric, // BS2 toont dit als ÉÉN tegel
    deze_maand: numeric         // huidige maand bedrag
  }
}
```

**BS2 toont alleen `nog_niet_gedeclareerd` als 1 KPI-tegel** (geverifieerd
in Claude-in-Chrome rapport, beschikking-detail Elize Jongebloed). Het
**onderscheid Achterstand (= som vorige maanden onbetaald) vs Lopende
Maand (= huidige maand bedrag)** bestaat NIET in BS2 en moet BS1-only
worden afgeleid:

```
achterstand_eur = som van te_declareren over alle maanden < huidige_maand
                  (uit declaratie-historie per beschikking)
lopende_maand_eur = te_declareren in huidige_maand (year=now.year, month=now.month)
nog_niet_gedeclareerd_totaal = achterstand_eur + lopende_maand_eur
```

Beide kleinere bedragen + de bekende totaal-tegel.

## 7. Zorgsoorten (6 in BS2-tenant — geverifieerd via `/api/care-types`)

| Naam | Eenheid | Tarief-veld |
|---|---|---|
| Gecombineerd | Week | week_rate |
| WLZ | Uur | hourly_rate |
| Ambulant extern | Uur | hourly_rate |
| Fasewonen | Dag | day_rate |
| Ambulant intern | Uur | hourly_rate |
| Verblijf en behandeling | Dag | day_rate |

**Geen aparte "Behandeling"** — gebundeld in "Verblijf en behandeling".

## 8. Maand-vergrendelen flow (geverifieerd, GLOBAAL)

```
POST /api/locked-months {"year":2026,"month":5} → 201
→ alle werkuren in die maand zijn read-only voor IEDEREEN
→ knop toggle't naar "Maand ontgrendelen"

DELETE /api/locked-months?year=2026&month=5 → 200
→ alle werkuren weer bewerkbaar
→ knop toggle't terug naar "Maand vergrendelen"
```

**BS2-bug**: geen confirm-dialoog op vergrendelen. Direct uit te voeren
zonder bevestiging. **BS1 voegt slider-confirm toe** (huisstijl-regel:
destructieve/kritieke acties altijd via `showSliderConfirmModal`).

## 9. Excel-specificatie download per declaratie (BS2-bug + BS1-fix)

**BS2-flow**:
- Knop verstopt: verschijnt pas als een rij-checkbox is aangevinkt
- Klik download-icoon naast header-checkbox
- Triggers S3-presigned URL: `MonthlyHourDeclaration_<NAAM>_<YYYY>_<MM>_local.xlsx`
- 503 in test (S3 tijdelijk down)

**BS1-implementatie** (PR #3):
- Knop **zichtbaar** per rij (niet verstopt)
- Server-side XLSX-generatie via `ff-export.js`-patroon
  (bestaat al voor andere modules)
- Bestandsnaam-format = exact `Urendeclaratie_<CLIENT>_<YYYY>-<MM>.xlsx`
  (NL-prefix conform huisstijl, ISO-datum)
- Inhoud per cliënt-maand:
  - Header: cliëntnaam, beschikking, periode, tarief
  - Per werkuur-regel: datum, medewerker, start, eind, duur, dienst, label, beschrijving, bedrag
  - Footer: totaal uren + totaal bedrag

## 10. Agenda-perspectief van een specifieke medewerker (BS2-bug + BS1-fix)

**BS2**: "Bekijken in agenda"-knop op `/time-registration/admin` routeert
naar `/home` (kapot voor admin-context). Geen werkende agenda-view in BS2.

**BS1 PR #4**: nieuwe pagina `medewerker-agenda.html?id=<uuid>` met:
- BS1 huisstijl (topbar/sidebar/content-header)
- Week- en maand-view kalender
- Geregistreerde uren uit `werkuren` + geplande diensten uit `planning`
  naast elkaar (verschillende kleuren)
- Filter op periode (FfDateRange-component)
- Knop op `medewerkers-overzicht.html` + `medewerker-detail.html` ("Bekijk agenda")
- Klikbare zijbalk-link op `werkuren.html` ("Open agenda van geselecteerde medewerker")

## 11. Pauline-override Ambulant Intern (bestaat niet in BS2)

**BS2-bevinding**: in Uurverantwoording-modal van Jordy Lont
(0u/0u Ambulant intern) en Dries Dekker (24u/0u Ambulant intern) **geen
Override-knop** zichtbaar. BS2 ondersteunt dit niet.

**BS1 PR #6**:
- Nieuwe kolom `urendeclaraties.override_uren numeric NULL` + `override_reden text` + `override_by uuid` + `override_at timestamptz`
- Per-rij knop "Aantal aanpassen" in `urendeclaraties.html`, alleen voor rijen waar `disposition.care_type = 'Ambulant intern'`
- Modal toont: huidige uren (read-only) + nieuwe uren (input) + verplicht reden-veld + opslaan
- Origineel `ingediende_uren` blijft staan; `override_uren` overrides voor declaratie-berekening
- Auditspoor in `audit_log` via bestaande `ff-audit.js` (kind: `override_hours`)

## 12. Budget-overschrijdings indicator (BS2-bug + BS1-fix)

**BS2**: alleen generiek geel waarschuwings-icoon naast cliëntnaam in
budgettering-pagina. Geen specifieke "overschrijding"-marker.

**BS1 PR #7**:
- Rode tekst + rood icoon op `urendeclaraties.html` rijen waar
  `ingediende_uren > budget_uren`
- Op `beschikking-detail.html`: rode badge "Budget overschreden" + bedrag
- Optionele kolom op `beschikkingen-dashboard.html` (aantal beschikkingen met overschrijding)

## 13. Filters & zoeken (verbatim BS2)

Werkuren-pagina:
- Maand-kalender (pijl-prev/next)
- Gebruiker-filter (multi-select dropdown)
- Cliënt-filter (multi-select dropdown)
- Label-filter (multi-select dropdown)
- "Filters wissen"-knop

Urendeclaraties-pagina:
- Jaar + Maand selectors (BS1 heeft die al)
- Zorgsoort-filter (BS1 heeft die al)
- Kolommen-chooser
- Maand vergrendel-knop (rechtsboven)

## 14. Permissies (uit `bs2_permissions` "time-registrations"-groep)

Te raadplegen via Supabase `select * from bs2_permissions where group_name = 'time-registrations'`.
Standaard-pattern: `view_*`, `manage_*`, `browse_*`. Voor
label-beheer: `manage_time_registration_labels` of vergelijkbaar.

PR #2 + #6 + #7 maken gebruik van bestaande `permissions.js` /
`permissions-gate.js` om Pauline-only knoppen (Override, Maand
vergrendelen, Excel-download) te tonen/verbergen.

## 15. Gap-analyse BS1 ↔ BS2

| Functionaliteit | BS1 status | Actie |
|---|---|---|
| Werkuren registreren | ✅ bestaat (`werkuren.html`) | Audit + verfijning |
| Werkuren wijzigen bulk-update | ✅ bestaat | Verifiëren payload-vorm |
| Labels CRUD + archive | ✅ bestaat (BS1 is rijker dan BS2: heeft archive) | Behouden |
| Labels filter | ✅ bestaat | OK |
| Filters W/Cliënt/Label | ✅ bestaat | OK |
| Budget per week | ✅ bestaat | Add overschrijdings-indicator (PR #7) |
| Urendeclaraties-overzicht | ✅ bestaat | Verfijning |
| **Maand vergrendelen WERKEND globaal** | ⚠️ tabel + knop bestaan, niet bedraad | **PR #2** |
| **Excel-specificatie download** | ❌ niet | **PR #3** |
| **Agenda perspectief medewerker** | ❌ niet | **PR #4** |
| **Onderscheid Achterstand vs Lopend** | ❌ niet | **PR #5** |
| **Override Ambulant Intern** | ❌ niet | **PR #6** |
| **Budget-overschrijdings indicator** | ❌ niet | **PR #7** |

## 16. Implementatieplan (7 PRs in volgorde)

| PR | Titel | Type | Tabel/code |
|---|---|---|---|
| **#1** | Spec-doc (deze) | docs | nieuw |
| **#2** | Maand afsluiten werkend + edit-block | feature | bestaand `werkuren_vergrendeld` + nieuwe trigger + `werkuren-data.js` + `urendeclaraties.js` |
| **#3** | Excel-specificatie download | feature | nieuw export-functie + knop op `urendeclaraties.html` |
| **#4** | Agenda-perspectief medewerker | feature | nieuwe `medewerker-agenda.html` + `medewerker-agenda.js` + knop op medewerker-overzicht |
| **#5** | Achterstand vs Lopende Maand KPI | feature | nieuwe berekening in `beschikkingen-data.js` + UI op `beschikking-detail.html` + `beschikkingen-dashboard.html` |
| **#6** | Pauline override Ambulant Intern | feature | nieuwe kolommen op `urendeclaraties` + modal + knop |
| **#7** | Budget-overschrijdings indicator | feature | UI in `urendeclaraties.html` + `beschikking-detail.html` + optioneel dashboard |

Per PR: feature-branch + commit + "Klik om te mergen"-link. Na alle 7:
**2 clean runs via Chrome MCP** (live BS1 verifiëren, 0 console-errors,
data klopt veld-voor-veld).

## 17. Bekende BS2-bugs die wij WEL goed doen in BS1

1. "Bekijken in agenda" routeert naar /home in BS2 → wij bouwen werkende agenda (PR #4)
2. Geen "+ Tijdregistratie toevoegen" op admin-view → bestaat al in BS1
3. Labels alleen hard delete in BS2 → BS1 heeft archive (behouden)
4. Lock-button zonder confirm in BS2 → BS1 slider-confirm (PR #2)
5. Excel-knop verstopt achter checkbox in BS2 → BS1 knop per rij zichtbaar (PR #3)
6. Geen Override-knop in BS2 → BS1 voegt toe (PR #6)
7. Item-teller/totalen inconsistent in BS2 → BS1 deterministische data-laag

## 18. Open follow-ups (mogelijk in latere sessie)

- Permissie-uitsplitsing per rol (Pauline-rol bestaat niet; toekennen
  aan Finance/Salarisadministratie of nieuwe rol).
- Mobile-app sub-features (zie `project_ff_mobile_app.md` in memory).
- BS2-bug-rapport doorsturen naar BS2-leverancier (buiten scope BS1).

## Bron-bestanden

- HAR: `~/Downloads/etf.acceptance.besasuite.nl.har` (2.4MB, 150 calls)
- Analyzer: `scripts/analyze-tijdreg-har.mjs`
- Output: `scripts/_bs2-tijdreg/endpoints-summary.json` + `detailed-calls.json`
- UI-rapport: lange paste in chat 2026-05-27 (Claude-in-Chrome 8-stappen scrape)
