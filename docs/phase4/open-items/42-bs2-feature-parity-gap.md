# Item 42 — BS2 → BS1 feature parity gap analyse (post-v1)

**Datum**: 2026-05-13
**Status**: 🟡 Gap-analyse compleet. Implementatie van geprioriteerde gaps loopt in vervolg-PRs.
**Doel**: 100% feature-parity met BS2 (`https://etf.acceptance.besasuite.nl`) behouden de eigen BS1 huisstijl + layout.

## Methode

Via Chrome MCP live walkthrough op 2026-05-13:
1. Alle 13 BS2 topmenu's bezocht
2. Per module: sub-tabs + key features + actie-buttons + KPI's gecaptured
3. Voor elke module: BS1-equivalent pages opgezocht in `*.html` + data-lagen
4. Gap-classificatie volgens legenda hieronder

## Legenda

- ✅ **Parity** — BS1 heeft equivalent
- 🟡 **Deels** — bestaat, maar features ontbreken of zijn shallower
- ❌ **Missing** — BS1 heeft het niet
- ⚪ **Visueel anders** — functionaliteit OK, design verschilt (= huisstijl, intended)

## Module-vergelijking (13 modules)

### 1. Home (`/home`)
- **BS2**: nieuws-feed + (mogelijk) widgets
- **BS1**: `home.html` met topbar links
- **Status**: ✅ — basis parity. Voor v2 evt. extra widgets als ETF wenst.

### 2. Planning (`/planning/overview`)
- **BS2 features**: grid-view, 6 KPI tiles (ZZP Kosten, Geplande uren, Openstaande uren, Kilometerkosten, Gem. tarief, Openstaande diensten), Filter Voorinstellingen + Aangepaste Filters, Cliënt-selectie, Exporteren, Vandaag-knop, Financiën-tab
- **BS1**: `planning.html`, `planning.js` (heeft ZZP-detectie + KPI-refs, "Openstaande diensten" string al aanwezig)
- **Status**: 🟡 — kernfuncties OK. **Gaps te verifiëren**:
  - Voorinstellingen-save UI (zou bestaande presets opslaan in DB) — BS1 heeft placeholder maar geen DB-tabel
  - Exporteren-functie (CSV/PDF download)
  - "Financiën"-subpagina (vermoedelijk financiële analytics over geplande shifts)

### 3. Urenregistratie (`/time-registration/time/summary`)
- **BS2**: per-medewerker tabel, calendar-view, vergrendelen, labels
- **BS1**: `werkuren.html`, `werkuren-labels.html`, `public.werkuren_vergrendeld`
- **Status**: ✅ — sterke parity volgens Phase 1 inventaris

### 4. HR (`/hr/employees`)
9 sub-tabs in BS2, allemaal aanwezig in BS1:

| BS2 sub-tab | URL | BS1 page | Status |
|---|---|---|---|
| Medewerkers | `/hr/employees` | `index.html` | ✅ |
| Competenties | `/hr/competencies` | `competenties.html` | ✅ |
| Opleidingen | `/hr/certifications` | `opleidingen.html` | ✅ |
| Locaties | `/hr/locations` | `locaties.html` | ✅ |
| Salarishuis | `/hr/salary-structure` | `salarishuis.html` | ✅ |
| Bureau's | `/hr/agencies` | `bureaus.html` | ✅ |
| Salarisadministratie | `/hr/monthly-payroll` | `salarisadministratie-exporter.html` | 🟡 (export wel; per-maand processing-flow te verifiëren) |
| Verzuim | `/hr/all-sickness` | `verzuim.html` | ✅ |
| Nieuws | `/hr/announcements` | `nieuws.html` | ✅ |

**Status totaal HR**: ✅ alle modules aanwezig. Feature-depth per sub-tab nog te verifiëren (zie sectie "Per-page deep dive").

### 5. Cliënten (`/clients`)
Sub-tabs:

| BS2 sub-tab | URL | BS1 page | Status |
|---|---|---|---|
| Cliënten | `/clients/overview` | `clienten.html` | ✅ |
| Zorgsoorten | `/clients/care-types` | `zorgsoorten.html` | ✅ |
| Organisatie | `/clients/organizations` | `organisatie.html` | ✅ |
| Gemeenten | `/clients/municipalities` | `gemeenten.html` | ✅ |
| Urendeclaraties | `/clients/hour-declarations` | `urendeclaraties.html` | ✅ |
| Uren budgetering | `/clients/weekly-budget` | `uren-budgettering.html` | ✅ |
| Facturen importeren | `/clients/import-csv` | `facturen-importeren.html` | ✅ |
| Incidenten | `/clients/manage-incidents` | `incidenten.html` | ✅ |
| Beschikkingen | (apart) | `beschikkingen.html` | ✅ |

**Status**: ✅ alle pages aanwezig in BS1.

### 6. Kilometers (`/mileage/declarations`)
- **BS2**: declaraties-lijst met filters
- **BS1**: `kilometers.html`
- **Status**: ✅ — Phase 1 confirmed parity

### 7. Facturen (`/invoices-module`)
- **BS2**: Te beoordelen + Alle facturen
- **BS1**: `facturen-te-beoordelen.html`, `facturen.html`
- **Status**: ✅

### 8. Taken (`/tasks/list`)
- **BS2**: enkele tab "Taken"
- **BS1**: `taken.html`
- **Status**: ✅ — page bestaat. Feature-depth (filters, statussen, assignments) te verifiëren

### 9. Medewerkers (`/main-employee`)
- **BS2**: zelfde data als `/hr/employees` maar via secundaire nav-link
- **BS1**: zelfde `index.html` toegankelijk
- **Status**: ✅ — duplicate nav-link, geen unieke functie

### 10. Beleid (`/documents`)
- **BS2**: enkele tab "Documenten" / "Beleid"; 25 documenten in lijst (per Phase 1)
- **BS1**: `beleid.html` + `public.beleidsdocumenten` tabel
- **Status**: ✅ page bestaat. Documenten-import + storage te verifiëren

### 11. Audit (`/audit`)
- **BS2**: "Audit Logs" met zoekveld (filter), 0 records zichtbaar
- **BS1**: `audit.html` + `public.audit_log` + `public.beschikking_audit_log` (~6000 records)
- **Status**: ✅ BS1 heeft meer audit-data dan BS2 (audit-triggers vangen meer)

### 12. Organisatie (`/organization`)
Sub-tabs:

| BS2 sub-tab | URL | BS1 page | Status |
|---|---|---|---|
| Teams | `/organization/teams` | `teams.html` | ✅ |
| **Rollen** | `/organization/roles` | — | ❌ **MISSING** |

**Rollen-detail BS2**: hierarchisch organogram met drag-drop, 5 niveaus (Eigenaarschap, Topmanagement, Middenmanagement, Specialisten & Adviseurs, Uitvoerend Personeel), 15 rollen totaal, gebruikers-counts per rol. Knoppen: Opslaan, Reset, Nieuwe rol, Nieuwe sectie.

**Status**: ❌ **Concreet feature-gap**. BS1 heeft alleen `profiles.rol` enum (admin|medewerker|viewer). Geen UI om rollen te beheren / aanvullen / hierarchie te zien. Voor v2 implementatie.

### 13. Instellingen (`/settings`)
Sub-tabs:

| BS2 sub-tab | URL | BS1 page | Status |
|---|---|---|---|
| Gebruikers | `/settings/users` | `instellingen.html` (deel) + Supabase Auth | ✅ |
| **Entiteiten** | `/settings/entities` | — | ❌ **MISSING** |
| Notificaties | `/settings/notification-types` | `instellingen.html` (Notificatie-instellingen + `notification_types` tabel) | ✅ |

**Entiteiten BS2**: tabel met kolom "Naam", 0 records — concept onduidelijk, vermoedelijk juridische entiteiten (BV/Stichting) waar ETF onder valt voor multi-org setup. **Niet kritiek** (0 records in BS2 = nooit gebruikt of net opgezet).

## Geprioriteerde gaps voor implementatie

### 🔴 Kritiek (concrete missing pages)

| # | Feature | BS2 URL | Effort | Waarde |
|---|---|---|---|---|
| 42-A | **Rollen-organogram** | `/organization/roles` | 8-12u | Hoog: nodig voor multi-rol gebruikers + RLS-hardening (item 39) |
| 42-B | **Entiteiten** | `/settings/entities` | 4-6u | Laag: BS2 0 records → niet actief gebruikt. Skip tenzij user vraagt |

### 🟡 Feature-depth verificatie (modules bestaan, verifieer features)

| # | Module | Wat te verifiëren |
|---|---|---|
| 42-C | Planning | Voorinstellingen-save in DB, Exporteren CSV/PDF, Financiën sub-page |
| 42-D | HR / Salarisadministratie | Per-maand processing flow vs alleen export |
| 42-E | Taken | Filters, statussen, assign-aan-medewerker |
| 42-F | Beleid | Document-import + Supabase Storage |

Voor elke 42-C t/m 42-F: per-module deep walkthrough nodig, dan implementatie per gap.

### 🟢 Already covered (geen actie)

11 van 13 BS2 modules hebben directe BS1 equivalent (HR sub-tabs, Cliënten sub-tabs, Urenregistratie, Kilometers, Facturen, Taken, Medewerkers, Beleid, Audit, Teams, Gebruikers, Notificaties).

## Implementatie-roadmap

### v2 sprint 1 — Rollen-organogram (8-12u)
1. **DB**: tabel `org_role_sections` (hierarchie levels) + `org_roles` (FK section) + uitbreiding `profiles.rol_id` FK
2. **Migratie**: huidige `profiles.rol` enum → seed default sections + roles
3. **UI**: read-only organogram (drag-drop voor v3)
4. **Effect**: BS1 kan zelfde rol-hierarchie tonen als BS2

### v2 sprint 2 — Planning Voorinstellingen (3-4u)
1. **DB**: tabel `planning_voorinstellingen` (naam + filter_json + user_id)
2. **UI**: save-current-filter knop in planning.html toolbar
3. **Effect**: users hoeven niet elke keer filters opnieuw in te stellen

### v2 sprint 3 — Planning Exporteren (2-3u)
1. **JS**: client-side CSV-export van zichtbare shifts (geen server-side roundtrip)
2. **Optioneel v3**: PDF via jsPDF

### v2 sprint 4 — Module deep dives (4-8u per module)
- Taken: filters/statussen
- Beleid: file-upload + storage
- HR/Salarisadministratie: per-maand workflow

### v3 — Entiteiten (4-6u, alleen als ETF actief gebruikt)
1. **DB**: tabel `entiteiten` met multi-org velden
2. **UI**: CRUD page
3. **Skip tenzij user vraagt** — BS2 heeft 0 records, mogelijk obsolete feature

## Totaal effort voor 100% parity

| Fase | Effort | Cumulatief |
|---|---|---|
| Sprint 1 — Rollen | 8-12u | 12u |
| Sprint 2 — Voorinstellingen | 3-4u | 16u |
| Sprint 3 — Exporteren | 2-3u | 19u |
| Sprint 4 — Module deep dives (4 modules × 4-8u) | 16-32u | 51u max |
| v3 — Entiteiten | 4-6u | 57u max |

**~30-50 uur** dedicated werk voor "echt 100% parity". Verspreid over meerdere sessies. Geen blocker voor v1 productie-gebruik.

## Conclusie

**v1 is functioneel "klaar genoeg"** — 11/13 modules met directe parity, 2 modules (Rollen + Entiteiten) missen volledig.

**Voor 100% parity**: roadmap hierboven. Volgende stappen worden per PR aangepakt, beginnend met **Sprint 1 (Rollen-organogram)** als grootste concrete gap.

## Acties uit deze audit

- ✅ Gap-document op disk persistent
- 🟡 Volgende PR: start Rollen-organogram implementatie (sprint 1)
- 🟡 Daarna per sprint één PR
