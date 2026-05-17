# Top-bar Medewerkers — BS2 functioneel model (1-op-1) — 2026-05-17

Bron: BS2 `https://etf.acceptance.besasuite.nl/main-employee/employees`
(recorder `bs2-medewerkers.json` + scrape `bs2-medewerkers-full.json`,
100/100, 0 fails, detail 100/100). BS2 = autoritatief. **Bindend contract**
voor de BS1-overname.

> ⚠️ **APART systeem.** Dit is NIET HR → Medewerkers
> (`index.html`/`medewerker.html`/`medewerkers`-tabel/`medewerkers-data.js`).
> Die blijft 100% ongemoeid en bereikbaar via de **HR**-top-link/dropdown.
> Patroon "twee gelijknamige systemen scheiden, niet koppelen" (zoals
> top-bar Facturen los van disposition Facturen).

## 1. Endpoints (BS2 API)

| Doel | Methode + path | Querystring | Opmerking |
|---|---|---|---|
| Lijst | `GET /api/employees-basic` | `filter[search]=<q>&page=N&limit=15&sort=first_name` | `meta.total=100`, `per_page=15` (hardcap, negeert `limit`), `last_page=7`, `links.{first,last,prev,next}` |
| Detail | `GET /api/employees-basic/{id}` | — | Exact dezelfde 14 velden als lijst (geen extra tabs) |
| Verzuim aanmaken | `POST /api/employee-absence-sicknesses` | body `{ "employee": { "id": "<uuid>" } }` | Maakt verzuim-case met Wet-Poortwachter `statutory_milestones[]`; daarna `is_sick=true`, `sickness_start_date` gezet |

## 2. Datamodel (BS1 `public.main_employees`, uuid PK = BS2 id)

14 BS2-velden **verbatim** → kolommen; volledige ruwe record (incl. `detail`)
→ `data.bs2_scrape`. Geen CHECK op `employment_type` (niet lossy maken).

| Kolom | Type | BS2-veld | Stats (100) |
|---|---|---|---|
| id | uuid PK | id | uniek 100/100 |
| first_name / last_name | text | first_name / last_name | nooit leeg |
| email / phone | text | email / phone | nooit leeg |
| employee_number | integer | employee_number | uniek, 3–221 |
| employment_end_date | date | employment_end_date | 1 gevuld / 99 null |
| date_of_birth | date | date_of_birth | nooit leeg |
| notes | text | notes | altijd null in BS2 |
| employment_type | text | employment_type | hiring 73 / permanent 24 / intern 3 |
| avatar | text | avatar | altijd null in BS2 |
| is_plannable | bool | is_plannable | 86 true / 14 false |
| is_sick | bool | is_sick | 92 false / 8 true |
| sickness_start_date | timestamptz | sickness_start_date | 8 gevuld |
| archived | bool | (BS1-only soft-delete) | default false |
| data | jsonb | `{bs2_id, bs2_scrape, bs2_scrape_at}` | 100% raw behoud |

## 3. Geverifieerde feiten

- BS2 `meta.total = 100` → BS1 `main_employees` moet **100** zijn.
- `detail`-endpoint voegt **geen** velden toe (0 diffs t.o.v. lijst).
- 1 BS2-testrecord: **"Test Medewerker"** (#— ). BS2 toont 100 → BS1 spiegelt
  100 (gedocumenteerde Δ; finale pre-productie re-crep ruimt op).
- 8 medewerkers `is_sick=true` met `sickness_start_date`.

## 4. UI — lijst (`medewerkers-overzicht.html`)

- Kolommen: Naam, Medewerkersnr., E-mailadres, Telefoonnummer, Dienstverband,
  Geboortedatum, Planbaar, Status (Ziek/Actief), Acties.
- Zoeken (BS2 `filter[search]`) → client-side over naam/e-mail/nummer.
- Filters: Gearchiveerd-toggle (BS1-huisstijl), Dienstverband-select
  (Inhuur/Loondienst/Stage = hiring/permanent/intern), Alleen-ziek-toggle,
  Reset.
- Paginatie: default **15/pagina** (= BS2 `per_page`), opties 15/30/50/100.
- Sortering: first_name asc (= BS2 `sort=first_name`).
- Hele rij klikbaar → `medewerker-detail.html?id=<uuid>` (BS2 navigeert naar
  `/main-employee/employee-details/{id}`). Status = niet-klikbare pill.
- `+ Medewerker toevoegen`, archiveren/verwijderen via slider-modals,
  herstellen direct (BS1-huisstijl).

## 5. UI — detail (`medewerker-detail.html`, BS2 screenshot 1-op-1)

Linker profielkaart: gradient-hero + terug-pijl, avatar-cirkel, naam, e-mail
(blauw, onder naam), **Contactgegevens** (telefoon, e-mail), **Overige
informatie** (Medewerkersnummer `#N` pill, Datum uit dienst of `-`,
Verjaardag `d-m-jjjj` + countdown-pills `X Dagen` / `Y Uren`).

Rechts: tab **Verzuim** (enige tab). Leeg: "Registreer een nieuw
ziekteverzuim voor deze medewerker." + `+ Verzuim toevoegen`. Bij `is_sick`:
actief-verzuim-blok (eerste ziektedag) + `Verzuim beëindigen`.

## 6. Workflows

- Verzuim toevoegen → `mainEmployeesDB.registerSickness(id, eersteZiektedag)`
  (zet `is_sick=true` + `sickness_start_date`) — spiegelt het netto-effect van
  BS2 `POST /api/employee-absence-sicknesses` op het basisrecord.
- Verzuim beëindigen → `endSickness(id)` (`is_sick=false`, datum leeg).
- CRUD medewerker: add/update/archive/restore/delete via `mainEmployeesDB`.

## 7. Connecties

Geen FK naar/uit andere BS1-modules (apart, los systeem). Tabel
`main_employees` staat los van `medewerkers` en de HR-sub-tabellen.

## 8. Gap / open

- **Verzuim-diepgang**: BS2's `POST` levert Wet-Poortwachter
  `statutory_milestones[]`. Een GET-lijst-endpoint voor bestaande
  verzuim-cases per medewerker is (nog) niet opgevangen — BS1 spiegelt nu het
  `is_sick`/`sickness_start_date`-niveau (= wat de lijst + screenshot tonen).
  Volledige milestone-weergave = follow-up zodra dat endpoint via recorder
  ontdekt is. Niet gokken.
- BS2-list-kolommen niet apart gescreenshot → kolomset afgeleid van de API +
  live geverifieerd vs BS2 (Chrome MCP) en bijgesteld.
- Verjaardag-countdown-formule (`X Dagen`/`Y Uren`): redelijke implementatie,
  live gekalibreerd tegen BS2.

## 9. Implementatie (atomic PRs)

- #247 recorder · #248 scrape · #249 schema+data-laag+scripts ·
  (#volgend) UI overzicht+detail + nav-repoint + dit spec-doc.
- Niet-destructief: nieuwe tabel `main_employees`; `medewerkers` (103) en
  HR-pagina's onaangeroerd; alleen de losse top-link "Medewerkers" +
  `top-nav-overflow.js` route herrouteert (HR-link/dropdown blijven
  `index.html`).

## 10. Verificatie

1. `write-main-employees.mjs` → Supabase `main_employees` = 100;
   `medewerkers` = 103 (onveranderd); `data.bs2_scrape` 100% per rij.
2. Chrome MCP live: top-bar "Medewerkers" → `medewerkers-overzicht.html`;
   lijst-aantal = Supabase = BS2 (100); filters/paginatie 1-op-1; rij-klik →
   detail = BS2-profielkaart + Verzuim-tab; ziek-status spiegelt BS2.
3. 2 clean runs zonder fix; 0 BS1-console-errors; HR-Medewerkers onveranderd.
