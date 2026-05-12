# BS2 → BS1 Port — Master Inventaris

Generated: 2026-05-12 — Phase 1 deliverable

Per-sectie detail in `docs/bs2-sections/*.md`. Dit document is de master-overview + gap-analyse.

---

## 1. Sitemap BS2 (volledig)

### Primaire nav (7 modules) — bovenste topbar

| # | Module | URL (default) | Sub-pages |
|---|---|---|---|
| 1 | **Home** | `/home` | — (single page met nieuws-feed) |
| 2 | **Planning** | `/planning/overview` | minstens 1 (overview); andere routes te ontdekken |
| 3 | **Urenregistratie** | `/time-registration/time/summary` | minstens 1 (summary); calendar-view en agenda mogelijk meer |
| 4 | **HR** | `/hr/employees` | **10 sub-tabs**: Medewerkers, Competenties, Opleidingen, Locaties, Salarishuis, Bureau's, Salarisadministratie, Verlof, Verzuim, Nieuws |
| 5 | **Cliënten** | `/clients/manage-incidents` | **9 sub-pages**: Cliënten overview, Zorgsoorten, Beschikkingen, Organisatie, Gemeenten, Urendeclaraties, Uren budgetering, Facturen importeren, Incidenten |
| 6 | **Kilometers** | `/mileage/declarations` | filter via query-params (month/year) |
| 7 | **Facturen** | `/invoices-module/invoices-to-review` | **2 sub-pages**: Te beoordelen, Alle facturen (`/monthly-invoices`) |

### Secundaire nav (6 items) — sidebar of dropdown

| # | Item | URL | Sub-pages |
|---|---|---|---|
| 8 | Taken | `/tasks/list` | — |
| 9 | Medewerkers | `/main-employee` | onduidelijk (leek leeg op moment van capture) |
| 10 | Beleid | `/documents` | — (25 documenten in lijst) |
| 11 | Audit | `/audit` | — |
| 12 | Organisatie | `/organization/teams` | **2 sub**: Rollen, Teams |
| 13 | Instellingen | `/settings/users` | **3 sub**: Gebruikers, Entiteiten, Notificaties |

### Extra
- Manual: `/manual` (hulp-documentatie, niet bezocht)

**Totaal**: ~35-40 unieke URLs als alle sub-pages worden meegerekend.

---

## 2. URL-conventies + technische patronen

- **URL = English slug**, UI = Dutch labels
- **Filter-syntax**: JSON:API stijl `filter[key]=value`, `period[start]=YYYY-MM-DD&period[end]=YYYY-MM-DD`
- **Paginering**: `page=N&limit=N`
- **Multi-value filters**: `status=submitted&status=approved`
- **Sortering**: `sort=field_name` (server-side)

## 3. API endpoints ontdekt (gedeeltelijke lijst)

API subdomain: **`https://api.etf.acceptance.besasuite.nl`**

| Endpoint | Methode | Doel |
|---|---|---|
| `/api/time/summary?filter[start_date]=...&filter[end_date]=...` | GET | Uren-overzicht periode |
| `/api/employees?page=N&limit=N&sort=first_name` | GET | Medewerkers-lijst |
| `/api/incidents?filter[my_clients]=true&page=N&limit=15` | GET | Incidenten met filters |
| `/api/broadcasting/auth` | OPTIONS | WebSocket auth (preflight) |

→ Phase 2: DevTools network log per sectie verzamelen om alle endpoints + payload-structuur vast te leggen.

---

## 4. Master gap-analyse — BS2 sectie → BS1 status

### Legenda
- ✅ = Bestaat in BS1 met vergelijkbare functionaliteit
- 🟡 = Gedeeltelijk in BS1 (page bestaat, features missen, of andere vormgeving)
- ❌ = Ontbreekt in BS1 — moet nieuw gebouwd worden
- ⚪ = Alleen visueel anders (functionaliteit gelijk)
- ❓ = Onzeker — diepere verkenning nodig in Phase 2

### Primaire modules

| BS2 sectie | BS1 mapping | Status | Opmerking |
|---|---|---|---|
| Home (nieuws-feed) | `home.html`, `nieuws-data.js`, `public.nieuws` | ✅ | BS1 schema bestaat, 0 rows. Schema-vergelijk bij Phase 2. |
| Planning (rooster + filters + KPI) | `planning.html`, `public.planning` (13 rows) | 🟡 | BS1 heeft basis; BS2 heeft Genereren/Optimiseren + dispatching + KPI's |
| Urenregistratie (tabel per medewerker, calendar, vergrendelen, labels) | `werkuren.html`, `public.werkuren`, `werkuren_vergrendeld`, `werkuren_labels` | ✅ | Sterke parity in schema + UI |
| HR / Medewerkers | `index.html` (= HR medewerkers-lijst), `public.medewerkers` (98 rows) | ✅ | BS1 ground-truth voor stijl |
| HR / Competenties | `competenties.html`, `public.competenties` (3 rows, uuid) | ✅ | |
| HR / Opleidingen | `opleidingen.html`, `public.opleidingen` (69 rows, uuid) | ✅ | |
| HR / Locaties | `locaties.html`, `public.locaties` (12 rows, uuid) | ✅ | |
| HR / Salarishuis | `salarishuis.html`, `public.salarisschalen` (12 rows) | ✅ | |
| HR / Bureau's | `bureaus.html`, `public.bureaus` (5 rows, uuid) | ✅ | |
| HR / Salarisadministratie | `salarishuis-wijzigingen.html`, `public.saladmin_*`, `public.salarishuis_wijzigingen` | 🟡 | Schema's bestaan; pagina structuur deels |
| HR / Verlof | `werkruimte.html` (verlof-tab), `public.medewerker_verlof_overgedragen` | 🟡 | Verspreid; geen dedicated HR-tab |
| HR / Verzuim | `medewerker.html` (per-employee), `public.verzuim` (5 rows), `medewerker_verzuim_perioden` | 🟡 | Per-medewerker view; geen unified HR-tab |
| HR / Nieuws | `nieuws-data.js`, `public.nieuws` (0 rows) | 🟡 | Data-laag bestaat, geen dedicated pagina (kan dezelfde tabel zijn als Home-feed) |
| Cliënten / overview | `clienten.html`, `clienten-data.js`, `public.clienten` (80 rows, text PK) | ✅ | |
| Cliënten / Zorgsoorten | `public.zorgsoorten` (7 rows, uuid) | 🟡 | Tabel + data-laag, mogelijk geen aparte pagina in BS1 |
| Cliënten / Beschikkingen | `beschikkingen.html`, `beschikkingen-overzicht.js`, `public.beschikkingen` (100 rows, text PK) | ✅ | Sterke parity |
| Cliënten / Organisatie (clients) | `public.organisaties` (4 rows, text PK) | 🟡 | Tabel bestaat, pagina-status onbekend |
| Cliënten / Gemeenten | `gemeenten.html`, `public.gemeenten` (227 rows, uuid) | ✅ | |
| Cliënten / Urendeclaraties | `public.urendeclaraties` (7 rows, text PK) | 🟡 | Schema bestaat; pagina onbekend |
| Cliënten / Uren budgetering | `public.uren_budget` (0 rows, text PK) | 🟡 | Schema bestaat, geen data |
| Cliënten / Facturen importeren | `facturen-importeren.html`, `facturen-importeren.js` | ✅ | |
| Cliënten / Incidenten | `incidenten.html`, `public.incidenten` (0 rows), `incident_categorieen` (13 rows) | ✅ | Categorieën al gevuld |
| Kilometers | `kilometers.html`, `public.kilometer_declaraties` (0 rows, text PK) | ✅ | Pagina + tabel bestaan |
| Facturen / Te beoordelen | `facturen-te-beoordelen.html` | ✅ | |
| Facturen / Alle facturen | `facturen.html`, `public.facturen` (**956 rows**, text PK) | ✅ | Productie-data al aanwezig |

### Secundaire modules

| BS2 sectie | BS1 mapping | Status | Opmerking |
|---|---|---|---|
| Taken | `werkruimte.html` (taken-tab?) | ❌ | Geen `taken`-tabel; module ontbreekt |
| Medewerkers (`/main-employee`) | overlap met HR | ❓ | Onduidelijk — content niet zichtbaar |
| Beleid (Documenten, 25 protocollen) | `werkruimte.html` (beleid-tab?) | ❌ | Geen `beleidsdocumenten`-tabel; geen storage-bucket |
| Audit | `werkruimte.html` (audit-tab?), `beschikking_audit_log` | 🟡 | Domein-specifiek audit-log bestaat, geen unified |
| Organisatie / Rollen | `public.profiles.rol` enum | 🟡 | Rol-enum bestaat, geen aparte rollen-tabel/UI |
| Organisatie / Teams | — | ❌ | Geen `teams`-tabel; module ontbreekt |
| Instellingen / Gebruikers | Supabase Auth + `public.profiles` | ✅ | Bestaat |
| Instellingen / Entiteiten | — | ❌ | Concept onbekend |
| Instellingen / Notificaties | — | ❌ | Geen `notification_types`-tabel |

---

## 5. Belangrijkste gaps (❌ = nieuw bouwen voor BS1)

1. **Taken** — module, tabel, page, UI
2. **Beleidsdocumenten** — tabel, Storage bucket, page, UI
3. **Teams** — tabel + M2M medewerker_teams, page, UI
4. **Unified Audit-log** — algemene tabel + UI
5. **Notification types** — tabel + UI
6. **Entiteiten** (`/settings/entities`) — concept eerst begrijpen in Phase 2

## 6. Belangrijkste mid-prio (🟡 = uitbreiden in BS1)

1. **Planning verrijken** — Genereren, Optimiseren, dispatching, KPI-kosten
2. **HR / Verlof + Verzuim** — dedicated tabs ipv per-medewerker view
3. **Cliënten sub-pages** — Zorgsoorten, Organisaties (clients), Urendeclaraties als losse pagina's
4. **Salarisadministratie** — UI uitbreiding
5. **Filters per pagina** vergelijken — BS2 heeft vaak rijkere filter-sets

---

## 7. Aanbeveling Phase 2 — eerste sectie

### Criteria
- **Laag risico**: bestaande BS1-parity hoog
- **Snel resultaat**: kleine datamodel, beperkte UI
- **Geeft mij ritme voor de loop**: per-sectie patroon vastleggen
- **Strategische waarde**: liefst iets dat de user direct ziet

### Top-3 kandidaten

| # | Sectie | Waarom | Risico |
|---|---|---|---|
| **1** | **Home / Nieuws-feed** | Schema bestaat al (`public.nieuws`, 0 rows); kleine UI; één pagina; user ziet direct effect (eigen homepage met content) | Laag — alleen schema-verificatie + CRUD |
| 2 | **HR / Medewerkers parity check** | BS1 ground-truth (`index.html`); diepte-vergelijk filters + kolommen; geen nieuwe code | Laag — vooral parity-audit |
| 3 | **Cliënten / Zorgsoorten** | Klein domein (7 rows), kleine UI, snelle warm-up | Laag |

**Aanbeveling: Sectie 1 = Home / Nieuws-feed.** Reden: schema-fit met BS1 is 100%, het is een single-page module, en de feed levert direct zichtbare content op de homepage van BS1 op. Dit valideert ook het hele port-pattern (inspect → schema → build → push → verify) op klein schaal voordat we naar grotere modules gaan zoals Planning of HR.

---

## 8. Open vragen voor user (Phase 2 input)

1. **Eens met "Home / Nieuws-feed" als eerste sectie?** Of voorkeur voor andere?
2. **`/main-employee` secundair Medewerkers** leek leeg in mijn capture — heb jij beeld bij wat dit is? (Zelf-profiel?)
3. **Beleidsdocumenten + Taken** zijn de grootste structurele gaps. Hoe belangrijk zijn deze voor ETF? Hoog/midden/laag prio voor port?
4. **Server-side paginering** (BS2) vs **client-side bulk-load** (BS1): voor 98 medewerkers, 100 beschikkingen, 956 facturen werkt client-side prima. Bij groei nodig om over te stappen — niet binnen scope nu, maar wel iets om in achterhoofd te houden.
5. **PDF-generatie van facturen** (BS2 doet server-side) — wil je dit in BS1 ook? Of laat staan?
6. **Mobiele app** (QR check-in voor diensten) — geen BS1-target voor nu, correct?

---

## 9. Wat moet er nog dieper in Phase 2 per sectie

Bij elke sectie-port (Phase 2 loop):
- Volledige sub-pages bezoeken (HR sub-tabs niet allemaal individueel bezocht in Phase 1)
- DevTools network capturen om exacte API endpoints + payload-vorm te zien
- "Add"-formulieren openen om create-velden te zien
- Detail-views openen om volledige veld-set te zien
- Filter-dropdowns openen om enum-waardes te zien
- Edge cases: archieveren / herstellen / massa-acties
