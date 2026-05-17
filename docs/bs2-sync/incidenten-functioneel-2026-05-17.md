# Incidenten — BS2 functioneel model (1-op-1 referentie) — 2026-05-17

Bron: volledige scrape + gedrag-recorder (`bs2-console-incidenten-tool.js v2`):
144 incidenten (lijst+detail) + opgenomen create/afhandelen/taak-calls +
`/api/incidents/dashboard`-respons. BS2 = autoritatief.

## BS2 structuur (Cliënten → Incidenten)

- BS2 heeft **geen** aparte pagina's voor Dashboard/Categorieën/
  Verbeteringsmaatregelen, MAAR de API levert ze wel:
  - `GET /api/incidents` (lijst, ~15/pagina, instabiele sort → stabiele sort
    `id` nodig; 144 totaal, allemaal `status=pending`)
  - `GET /api/incidents/{id}` (detail, incl. `tasks[]`)
  - `GET /api/incidents/dashboard` (berekeningen — zie onder)
  - `GET /api/incident-categories` (**13** categorieën; 11 in gebruik)
  - `GET /api/tasks` + `POST /api/tasks` (taken per incident via `incident_id`)

## BS2 incident — datamodel (Engelse veldnamen)

`id, incident_date, time_of_day, outside_location(bool), incident_actors,
description, category_explanation, required_explanation, safety_measures,
personal_impact, parents_notified(bool), parents_not_notified_reason,
call_requested(bool), status, assessment, resolved_at,
fits_patient_profile(bool), fits_patient_profile_explanation,
care_plan_update_needed(bool), care_plan_update_description,
advice_and_guidelines, created_at, updated_at, deleted_at,
category{}, clients[], location{}, reporter{}, employees[], other_parties[],
files[], tasks[]`

Enums:
- `status`: `pending` | `in_progress` | `completed`  (BS1-NL: in_afwachting |
  in_behandeling | opgelost) — mapping 1-op-1
- `time_of_day`: morning | afternoon | midday | evening | night
- `incident_actors`: alleen_client | client_naar_client |
  client_naar_medewerker | client_naar_overige (+ evt. meer)

## BS2 gedrag (opgenomen payloads — exact)

**Create** `POST /api/incidents` →
`{incident_date, time_of_day, outside_location, location_id, category_id,
incident_actors, description, safety_measures, personal_impact,
parents_notified, parents_not_notified_reason, required_explanation,
call_requested, client_ids[], files[], other_parties[],
notification_type("none"|…), notification_employees[]}`
Server zet defaults: `status:"pending"`, alle afhandel-velden `null`,
`resolved_at:null`; embed `category{}` + `clients[]` (met phase/care-datums).

**Afhandelen** `PATCH /api/incidents/{id}` →
`{fits_patient_profile, fits_patient_profile_explanation,
care_plan_update_needed, care_plan_update_description,
advice_and_guidelines, status}`  (status-overgang hier; bij `completed`
verwacht: `resolved_at` gevuld → voedt avg_resolution_time).

**Taak** `POST /api/tasks` →
`{title, status("--"|…), due_date, is_private(bool), assignee,
priority("Low"|…), collaborators[], incident_id, files[]}`
Response: task met `id, creator{}, …`. Taken zijn een **aparte entiteit**
gekoppeld via `incident_id`.

**Dashboard** `GET /api/incidents/dashboard` — DEFINITIEF (bewezen via
user-DevTools-recorder, 31 echte calls, 2026-05-17):
```
?filter[start_date]=YYYY-MM-DD&filter[end_date]=YYYY-MM-DD
  &filter[client]=<uuid>&filter[employee]=<uuid>   (alle optioneel)
{
 overview:{ total_incidents, status_counts:{pending,in_progress,completed} },
 status_distribution:{ pending:{count,percentage}, in_progress:{…}, completed:{…} },
 average_resolution_time:{ hours, note },
 last_7_days:[ {date:"YYYY-MM-DD", day:"<EN weekday>", count} … ],
 by_category:[ {category_id 1-13 (BS2-order), category_name, count} … ALLE 13 ],
 by_location:[ {location_id, color, location_name, count} … alleen >0; GEEN null/Onbekend-bucket ],
 improvement_measures:{ total, completed, pending, completion_percentage, measures:[] }
}
```
**Bindende regels (1-op-1):**
- **PERIODE-AFHANKELIJK.** Géén filter → hele set. Mét filter → ALLE blokken
  filteren. (Stap-4d-aanname "periode-onafhankelijk" was FOUT.)
- Filter op **`created_at`** (registratiedatum = BS1 `aanmaakdatum`), NIET
  `incident_date` (gebeurtenisdatum). Bewezen: BS1 `aanmaakdatum::date` ==
  `bs2_scrape.created_at` 144/144; april=104, 14-30apr=90, maart=0, feb=1
  exact. Vergelijk op kalenderdatum-string (tz-veilig).
- `status_distribution.percentage` = round(count/total*100); total 0 → 0.
- `average_resolution_time.hours` = null als geen afgehandelde in periode;
  `note` = vast: "Gemiddelde tijd tussen het aanmaken van een incident en de
  afhandeling ervan." (altijd tonen).
- `last_7_days` = 1 entry per kalenderdag van start t/m eind (GEEN min-7);
  zonder bereik = laatste 7 dagen t/m vandaag. count op `created_at`.
- `by_location` telt **niet** incidenten zonder locatie (geen Onbekend);
  total/by_category tellen ze wél mee.
- BS1: locatie komt uit `data.bs2_scrape.location` (locatieBs2) — BS1-FK
  `locatie_id` is bij gereconcilieerde incidenten leeg.
BS1-implementatie 1-op-1 in `incidenten-dashboard.js` (#223+#224), veld-voor-
veld live geverifieerd 2026-05-17 (2 clean runs, 0 afwijkingen).

## BS2 categorieën (`/api/incident-categories`, 13)

Velden: `{id, name, description, is_active, order, created_at, updated_at,
deleted_at}`. 11 in gebruik door incidenten: Delinquent Gedrag 64, Vermist 23,
Fysieke Agressie 17, Middelenbezit 16, Verbale Agressie 15, Medicatie 2,
SGOG 2, Suïcidepoging 2, Suïcidale Uitingen 1, Vrijheidsbeperkende
Maatregelen 1, Letsel 1. (+ o.a. "Datalek" order 2 ongebruikt.)

## BS1 huidige staat (gap)

- `incidenten` = **139** (0 archived, géén bs2_id-kolom). Mist BS2-velden:
  category_explanation, required_explanation, parents_not_notified_reason,
  assessment, resolved_at, fits_patient_profile,
  fits_patient_profile_explanation, care_plan_update_needed,
  care_plan_update_description, advice_and_guidelines.
- `incident_categorieen` = **26** (BS2: 13) — gedrift, moet 1-op-1 BS2.
- `verbeteringsmaatregelen` = **0** (geen BS2-tegenhanger gevonden → BS1-only).
- `incident_documenten` = **0** (BS2 `files[]` per incident).
- **Geen** BS1 taken-entiteit (BS2 `/api/tasks` per incident) → ontbreekt.
- BS1 incidenten-dashboard berekent NIET zoals BS2's `/api/incidents/dashboard`
  (status%/avg-resolution/daily-timeline).

## Plan (atomic PR's, niet-destructief waar kan; reconcile = backup + akkoord)

1. **Schema**: `incidenten` uitbreiden met de ontbrekende BS2-velden +
   `data jsonb` (bs2_id-traceer). Nieuwe tabel `incident_taken`
   (BS2 `/api/tasks`-model, FK incident). `incident_categorieen` → 1-op-1
   BS2 (13). Backups `_*_bak_2026_05_17`.
2. **Data-reconcile** (na user-scrape, niet-destructief: match op bs2_id/
   kenmerken; insert ontbrekende → 144; categorieën → 13; documenten/taken).
3. **incident-melden.js**: alle BS2 create-velden + afhandelen-PATCH
   (assessment) + status-flow + taken-CRUD, BS1-huisstijl.
4. **incidenten.js / overzicht**: kolommen/filters/tabs exact BS2 + status-map.
5. **incidenten-dashboard.js**: 1-op-1 `/api/incidents/dashboard`-formules
   (snapshot-patroon waar BS2 server-side rekent, zoals beschikkingen-dashboard).
6. **categorieën-pagina**: 1-op-1 BS2-categorieën.
7. Verbeteringsmaatregelen: BS1-only — buiten BS2-scope (apart bespreken).
8. Verificatie: 144 + 13 + dashboard veld-voor-veld = BS2, 2 clean runs,
   visueel + functioneel + 0 console-errors.

Status-mapping (overal): pending↔in_afwachting, in_progress↔in_behandeling,
completed↔opgelost.
