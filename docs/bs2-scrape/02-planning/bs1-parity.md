# Module 02: Planning — BS1 PARITY-CHECK

**Gescraped op**: 2026-05-13 (retroactief, na BS2 batches 1-5 voltooid)
**BS1-URL getest**: `https://besa-suite.vercel.app/planning.html`
**Test-account**: `sonck802@gmail.com` (admin-tier)
**BS2-equivalent**: `https://etf.acceptance.besasuite.nl/planning/overview` + `/planning/management/*`

## BS1 codebase-componenten

| Type | Bestand(en) | Doel |
|---|---|---|
| Page | [planning.html](../../../planning.html) | Planning grid + modals (528 regels) |
| Page-script | [planning.js](../../../planning.js) | Page-logic (3117 regels — grote module) |
| Data-laag | [planning-data.js](../../../planning-data.js) | `window.planningDB` (Supabase planning CRUD) |
| Data-laag | [planning-voorinstellingen-data.js](../../../planning-voorinstellingen-data.js) | Filter-presets data-laag |

## Supabase-tabellen relevant voor Module 02

| Tabel | Status | Cols | Doel |
|---|---|---|---|
| `public.planning` | ✅ Bestaat | 16 | Diensten (id text, start_iso, einde_iso, diensttype, afdeling, functie, teamlead, teamlid, client, vestiging, locatie, conflict, archived, aanmaakdatum, laatst_gewijzigd, data jsonb) |
| `public.comp_diensttypes` | ✅ Bestaat | 8 | Diensttypes (compensatie-context) |
| `public.locaties` | ✅ Bestaat | 12 | Locaties met kleur |
| **`public.dienst_uitnodigingen`** | ❌ **MISSING** | — | Uitgenodigde medewerkers per dienst |
| **`public.dienst_activiteiten`** | ❌ **MISSING** | — | Audit-log per dienst (BS2 toont in Activiteit-sectie) |
| **`public.dienst_comments`** | ❌ **MISSING** | — | Comments-thread per dienst |
| **`public.dienst_recurring`** | ❌ **MISSING** | — | Herhalings-config voor diensten |
| **`public.beschikbaarheidstypes`** | ❌ **MISSING** | — | Beschikbaarheidstypes (uit /management) |
| **`public.dienstwissels`** | ❌ **MISSING** | — | Shift-swap aanvragen |
| **`public.planning_settings`** | ❌ **MISSING** | — | Compensatie-uren drempelwaarden config |
| **`public.filter_presets`** | ❌ **MISSING** | — | Voorinstellingen (sidebar feature) |

## BS1 planning-table-kolommen vs BS2-velden

BS1 `planning` tabel kolommen:

| BS1-kolom | BS2-equivalent | Status |
|---|---|---|
| `id` (text) | id | ✅ Match |
| `start_iso` (timestamptz) | starts_at | ✅ Match |
| `einde_iso` (timestamptz) | ends_at | ✅ Match |
| `diensttype` (text) | diensttype | ✅ Match (al was BS2 een FK, BS1 is text-tag) |
| `afdeling` (text) | — | ⚠️ BS1-EXTRA (niet in BS2) |
| `functie` (text) | — | ⚠️ BS1-EXTRA |
| `teamlead` (text) | — | ⚠️ BS1-EXTRA |
| `teamlid` (text) | medewerker_id (uuid FK in BS2) | 🟡 Type-mismatch (text-naam vs uuid FK) |
| `client` (text) | client_id (uuid FK) | 🟡 Type-mismatch |
| `vestiging` (text) | — | ⚠️ BS1-EXTRA |
| `locatie` (text) | locatie_id (uuid FK) | 🟡 Type-mismatch |
| `conflict` (boolean) | — | ⚠️ BS1-EXTRA |
| `archived` (boolean) | trashed (boolean) | ✅ Functioneel match |
| `aanmaakdatum`, `laatst_gewijzigd` | created_at, updated_at | ✅ Match |
| `data` (jsonb) | — | 🟡 Catch-all kolom; mogelijk bevat extra velden zoals pauze/competenties |

**Missing BS2-velden in BS1 schema** (kritiek voor parity):
- ❌ `pauze_uren` (number)
- ❌ `vereist_aantal_medewerkers` (number, default 1)
- ❌ `vereiste_competenties` (uuid[] of jsonb array of FK)
- ❌ `beschrijving` (text — rich-text content uit Tiptap)
- ❌ `open_voor_aanmelding` (boolean — Open/Gesloten state uit B5.E toggle)
- ❌ `parent_dienst_id` (text — voor herhalings-diensten link)

## BS1 + Dienst aanmaken modal — velden-vergelijking

**BS1 `#planning-add-modal` velden** (uit Chrome MCP DOM-inspectie):

| BS1-veld | Type | BS2-equivalent | Status |
|---|---|---|---|
| Afdeling / team | select | — | ⚠️ BS1-EXTRA |
| Diensttype | select | ✅ Diensttype dropdown | ✅ Match |
| Functie (titel in rooster) | text | — | ⚠️ BS1-EXTRA |
| Vestiging | select | — | ⚠️ BS1-EXTRA |
| Locatie | select | ✅ Locatie dropdown | ✅ Match |
| Teamlead | select | — | ⚠️ BS1-EXTRA |
| Teamlid | select | Medewerkers dropdown | 🟡 Naam-verschil (Teamlid vs Medewerkers) |
| Cliënt | select | ✅ Cliënt dropdown | ✅ Match |
| Start | datetime-local | ✅ Starttijd (date + time apart) | 🟡 BS1 = 1 input, BS2 = 2 inputs |
| Einde | datetime-local | ✅ Eindtijd | 🟡 idem |
| Leer (0–3) | number | — | ⚠️ BS1-EXTRA |
| Sterren (0–3) | number | — | ⚠️ BS1-EXTRA |
| Markeer als aandacht | checkbox | — | ⚠️ BS1-EXTRA |
| — | — | ❌ **Pauze (uren)** | ❌ Missing |
| — | — | ❌ **Vereist aantal medewerkers** | ❌ Missing |
| — | — | ❌ **Vereiste competenties** (dropdown) | ❌ Missing |
| — | — | ❌ **Beschrijving** (rich-text editor met 8 formatters) | ❌ Missing |
| — | — | ❌ **Herhaling-toggle** + 3 sub-velden (Herhaal iedere/Eindigt op/Herhaal op) | ❌ Missing |

## BS1 Dienst bekijken modal (`#planning-view-modal`)

**BS1-inhoud**: alleen "Dienst bekijken" titel + Sluiten + Bewerken knoppen.

**BS2-inhoud** (uit `behaviors.md` Actie 6):
- ✅ Header: titel + Verwijderen (rood) + Bewerken
- ✅ Open dienst / Gesloten dienst toggle (B5.E)
- ✅ Top-info row 4-kolommen (Diensttype + Locatie + Datum + Tijd)
- ✅ Beschrijving sectie
- ❌ **Toegewezen (N/M) sectie** + Toewijzen knop + per-medewerker de-assign X
- ❌ **AI suggesties** sectie + "AI suggesties laden" knop (B5.F)
- ❌ **Uitgenodigd** sectie + Uitnodigen knop
- ❌ **Aanmeldingen** sectie
- ❌ **Activiteit** sectie (audit-log per dienst)
- ❌ **Comment-box** "Stel een vraag of plaats een update..." + Plaats reactie knop (B5.G)

→ **BS1 view-modal is praktisch leeg vergeleken met BS2**. Vrijwel alle inhoud ontbreekt.

## Per BS2-actie systematische parity-vergelijking

| BS2-actie | BS1-status | BS1-locatie | Gap | Categorie |
|---|---|---|---|---|
| **Actie 1: + Dienst aanmaken modal** | 🟡 Partial | `#planning-add-modal` | BS1 heeft modal met 13 velden, BS2 had 10+ — overlap maar ook BS1-EXTRA (Afdeling/Functie/Vestiging/Teamlead/Leer/Sterren) en BS1-MISSING (Pauze/Vereist aantal/Competenties/Beschrijving/Herhaling) | UI+Schema-gap |
| **Actie 2: Genereren (AI Wizard)** | 🟡 Knop bestaat | `planning.html` toolbar | Knop "Genereren" zichtbaar, **functionaliteit niet gevalideerd**. BS2 had 5-stappen wizard. BS1-implicatie: rule-based template-applier | Behavior-gap (groot) |
| **Actie 3: Optimaliseren (AI Optimizer)** | 🟡 Knop bestaat | `planning.html` toolbar (zien als "+ Optimaliseren") | Knop zichtbaar, **functionaliteit onbekend**. BS2 had 2-stappen wizard | Behavior-gap |
| **Actie 4: Klik "Maand" period-toggle** | ❓ Knop bestaat | `planning.html` "Maand" toolbar-toggle | Toggle aanwezig, **maand-view layout niet getest**. BS2: KPI-cards worden leeg in Maand-view | Behavior-gap (te verifiëren) |
| **Actie 5: Klik "Week" period-toggle** | ✅ Default | `planning.html` "Week" toggle | Default-state | — |
| **Actie 6: Klik dienst-cell → Dienstdetails** | 🟡 Partial | `#planning-view-modal` | Modal opens (vermoedelijk via planning.js click-handler), maar inhoud minimaal: titel + Sluiten + Bewerken. **ALLE BS2-secties missing** (Toegewezen/AI/Uitgenodigd/Aanmeldingen/Activiteit/Comments) | UI+Schema-gap (groot) |
| **Actie 7: Klik Bewerken in Dienstdetails** | 🟡 Knop bestaat | view-modal Bewerken-btn | Implementatie niet getest. BS2: wisselt naar edit-mode inline | Behavior-gap |
| **Actie 8: Verwijderen** | ❓ Niet getest in BS1 | n/a | BS1 heeft delete-flow via `archived=true` (archiveer-knop in row-actions?). BS2 had centered confirm-modal met radio-keuze "Alleen deze dienst / Deze + vergelijkbare aankomende diensten" | UI-gap |
| **Actie 9: Uitnodigen knop in Dienstdetails** | ❌ Niet aanwezig | n/a | Geen Uitnodigen-knop in BS1 view-modal. Schema-tabel `dienst_uitnodigingen` ontbreekt | UI+Schema-gap |
| **Actie B5.A/B/C: Hover quick-action icons (eye/pencil/trash)** | ❓ Niet getest | n/a | BS1 cell-hover gedrag onbekend — cells leeg in test-week | UI-gap (te verifiëren) |
| **Actie B5.D: Toewijzen knop + bulk-checkbox** | ❌ Niet aanwezig | n/a | Geen Toewijzen-knop in BS1; geen "Toepassen op vergelijkbare diensten" | UI+Behavior-gap |
| **Actie B5.E: Open / Gesloten dienst toggle** | ❌ Niet aanwezig | n/a | Geen kolom `open_voor_aanmelding` in `planning`; geen toggle in view-modal | Schema+UI-gap |
| **Actie B5.F: AI suggesties laden knop** | ❌ Niet aanwezig | n/a | Geen AI-feature in BS1. Voor parity: rule-based Edge Function (geen externe AI, max 5 suggesties op competenties + beschikbaarheid) | Behavior-gap (groot) |
| **Actie B5.G: Plaats reactie comment** | ❌ Niet aanwezig | n/a | Geen comment-box in BS1; geen `dienst_comments` tabel | UI+Schema-gap |
| **Actie B5.H: +N badge hover-tooltip** | ❓ Niet getest | n/a | BS1 cell-onderaan medewerker-badges niet gezien (week leeg in test) | UI-gap (te verifiëren) |
| **Actie B5.I: Lijst-view toggle** | 🟡 Knop bestaat | toolbar "Lijst"-toggle | Click registreert (toggle visueel) maar layout niet vergeleken met BS2's day-grouped sections + Unassigned shifts banner | Behavior-gap |
| **Actie B5.J/K/L: dag-header + KPI + group-header NO-OP** | ✅ Match | n/a | BS1 ook NO-OP (geen click-handlers; gewenste gedrag identiek) | — |
| **Actie B5.M: Drag-and-drop dienst-cell** | ❓ Niet getest | n/a | `planning.js` 3117 regels — drag-handlers wel aanwezig (zien `dragstart` regels te zoeken). **Te verifiëren** | Behavior-gap (te checken) |
| **Filter-radios (Toewijzingsstatus + Dienstverband)** | ✅ Match | `planning.html` sidebar | BS1 heeft Toegewezen/Niet toegewezen/Vervanging vereist/Alle radios + Inhuur/Loondienst/Inhuur en Loondienst | — |
| **Filter Diensttype/Teamlid/Cliënt dropdowns** | ✅ Match | `planning.html` sidebar dropdowns | BS1 heeft dropdowns | — |
| **Filter Voorinstellingen + Nieuwe voorinstelling maken** | 🟡 Knop bestaat | `planning-voorinstellingen-data.js` (169 regels) | BS1 heeft data-laag voor voorinstellingen, maar `filter_presets` tabel niet gevonden in schema-check. **Verifieer tabel-bestaan** | Schema-gap (te checken) |
| **Exporteren** | ✅ Knop bestaat | `planning.html` "Planning export" + sidebar "Exporteren" | BS1 heeft Exporteren-knop. **Output-format (CSV/Excel/PDF) niet vergeleken** | Behavior-gap (low) |
| **Filters wissen** | ✅ Match | `planning.html` sidebar bottom-link | Reset alle filters | — |
| **5 KPI-cards** | ✅ Match | `planning.html` ZZP Kosten / Geplande uren / Openstaande uren / Kilometerkosten / Gem. tarief | Identiek aan BS2 | — |
| **/planning/management sub-pages (5 stuks)** | ❌ Niet aanwezig | n/a | Geen `planning-management.html` of `availability-types.html` of `shift-types.html` of `switch-shifts.html` of `planning-settings.html`. **All 5 sub-pages ontbreken** | UI+Schema-gap (groot) |
| **Diensttypes tabel-management** | 🟡 Partial | `compensatie-diensttypes.html` bestaat | BS1 heeft Diensttypes-management onder Compensatie module — niet onder Planning. **Re-routing nodig of duplicaat** | Routing-gap |
| **Beschikbaarheidstypes management** | ❌ Niet aanwezig | n/a | Geen `beschikbaarheidstypes.html` | UI+Schema-gap |
| **Dienstwissels (Diensten wisselen) management** | ❌ Niet aanwezig | n/a | Geen swap-feature | UI+Schema-gap |
| **Planning instellingen (Compensatie-uren Drempelwaarden)** | ❌ Niet aanwezig | n/a | Geen settings-pagina + tabel `planning_settings` ontbreekt | UI+Schema-gap |
| **Read-audit voor planning-views** | ❌ Niet aanwezig | n/a | Geen `audit_log` entries voor planning-page-views | Audit-gap |
| **Real-time updates (Supabase Realtime)** | ❓ Onbekend | `planning.js` te checken voor `supabase.channel(...)` | BS2 had WebSocket; BS1 implementatie te verifiëren | Real-time-gap (te checken) |
| **Optimistic locking bij concurrent edits** | ❓ Onbekend | `planning-data.js` updated_at-check te zoeken | v3-plan Fase E.11 vereist `updated_at`-check + conflict-modal | Behavior-gap |

## Gap-categorieën samengevat

| Categorie | Count |
|---|---|
| ✅ Match | 7 |
| 🟡 Partial | 11 |
| ❌ Missing | 11 |
| ❓ Niet getest | 5 |
| **Total** | **34** |

## Schema-gaps in detail

```sql
-- VEREIST voor BS2-parity (Fase E.1 migrations):

-- 1. Open/Gesloten state op planning
alter table public.planning
  add column if not exists open_voor_aanmelding boolean default true,
  add column if not exists pauze_uren numeric,
  add column if not exists vereist_aantal_medewerkers integer default 1,
  add column if not exists beschrijving text,
  add column if not exists parent_dienst_id text references public.planning(id) on delete set null;

-- 2. Uitnodigingen-tabel (status: uitgenodigd/aangemeld/toegewezen/geweigerd)
create table if not exists public.dienst_uitnodigingen (
  id uuid primary key default gen_random_uuid(),
  dienst_id text references public.planning(id) on delete cascade,
  medewerker_id uuid references public.medewerkers(id),
  status text not null check (status in ('uitgenodigd','aangemeld','toegewezen','geweigerd')),
  uitgenodigd_door uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Activity-log per dienst (audit + comments samen)
create table if not exists public.dienst_activiteiten (
  id uuid primary key default gen_random_uuid(),
  dienst_id text references public.planning(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id),
  type text not null check (type in ('audit','comment')),
  action text,
  body text,
  created_at timestamptz default now()
);

-- 4. Recurring-config
create table if not exists public.dienst_recurring (
  id uuid primary key default gen_random_uuid(),
  parent_dienst_id text references public.planning(id) on delete cascade,
  interval_weeks integer default 1,
  end_date date not null,
  days_of_week integer[] not null,
  created_at timestamptz default now()
);

-- 5. Vereiste competenties M2M
create table if not exists public.dienst_competenties (
  dienst_id text references public.planning(id) on delete cascade,
  competentie_id uuid references public.competenties(id) on delete cascade,
  primary key (dienst_id, competentie_id)
);

-- 6. Management sub-pages
create table if not exists public.beschikbaarheidstypes (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  starttijd time,
  eindtijd time,
  archived boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.dienstwissels (
  id uuid primary key default gen_random_uuid(),
  van_dienst_id text references public.planning(id),
  naar_dienst_id text references public.planning(id),
  requested_by uuid references auth.users(id),
  status text not null check (status in ('pending','approved','rejected')),
  cost_difference numeric,
  created_at timestamptz default now()
);

create table if not exists public.planning_settings (
  id uuid primary key default gen_random_uuid(),
  min_compensatie_uren integer default -20,
  max_compensatie_uren integer default 20,
  updated_at timestamptz default now()
);
```

## Fase E-prioritering (gap-fix-PR plan)

**P1 (kritiek)**:
1. Schema: alle 6 ontbrekende tabellen + planning-kolommen toevoegen
2. + Dienst aanmaken modal: voeg Pauze/Vereist aantal/Competenties/Beschrijving/Herhaling toe
3. Dienst-detail modal: 7 missing secties (Toegewezen/AI/Uitgenodigd/Aanmeldingen/Activiteit/Comments + Open/Gesloten toggle)
4. Toewijzen + Uitnodigen flows
5. Delete confirm-modal met radio-keuze (Alleen / + vergelijkbare)

**P2 (belangrijk)**:
6. AI suggesties (rule-based via Edge Function, geen externe AI)
7. Herhalings-diensten generator
8. Lijst-view layout
9. Hover quick-action icons op cells

**P3 (na go-live OK)**:
10. /planning/management 5 sub-pages
11. Genereren-wizard (template-applier)
12. Optimaliseren-wizard
13. Read-audit + real-time + optimistic locking

## Eindconclusie

**Module 02 parity-status**: **~35% bereikt**.

**Werkende kernfunctionaliteit**: planning-grid layout (KPI + days + groups + filters + sidebar). Add-modal en view-modal aanwezig met andere velden-set dan BS2.

**Gaps (kritiek voor productie)**: 
- 11 ❌ MISSING acties incl. core features (Uitnodigen/Toewijzen/AI/Activiteit/Comments/Open-Gesloten/herhalings-diensten)
- 11 🟡 PARTIAL acties die afwijkende implementatie hebben (Add-modal velden + Bewerken/Genereren/Optimaliseren-knoppen niet gevalideerd)
- /planning/management 5 sub-pages allemaal ontbreken
- 6 ontbrekende Supabase-tabellen (dienst_uitnodigingen / dienst_activiteiten / dienst_recurring / dienst_competenties + beschikbaarheidstypes / dienstwissels / planning_settings + filter_presets)

**BS1 heeft EXTRA velden** die BS2 niet heeft (Afdeling/Functie/Vestiging/Teamlead/Leer/Sterren) — keep deze in BS1 als domein-specifieke uitbreidingen, **niet** verwijderen (legacy migratie-data afhankelijk).

**Volgende stappen**: Fase E vereist meerdere fix-PRs voor Module 02 (mogelijk 8-12 PRs voor full parity). Module 02 is **niet productie-klaar** zonder major schema-expansie + UI-werk.
