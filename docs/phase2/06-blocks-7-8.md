# Phase 2 — Blocks 7-8: Verlof + Instellingen

**Datum**: 2026-05-12
**Commits**: `fd54b24` (Verlof), `4c3899b` (Instellingen)
**Status**: ✅ Beide modules gebouwd en gepusht

## Block 7 — Verlof aanvragen

### Schema (`create_verlof_aanvragen`)
```sql
public.verlof_aanvragen (
  id text PK,
  medewerker_id uuid REF medewerkers ON DELETE CASCADE,
  type CHECK (wettelijk|bovenwettelijk|ouderschap|calamiteit|doktersbezoek|onbetaald|anders),
  start_datum, eind_datum date,
  aantal_dagen numeric,  -- decimal voor halve dagen
  status CHECK (concept|ingediend|goedgekeurd|afgewezen|geannuleerd) DEFAULT 'concept',
  beschrijving, ingediend_op, beoordeeld_op, beoordeeld_door, beoordeling_opmerking,
  archived, aanmaakdatum, laatst_gewijzigd
)
```
+ 4 RLS auth-only + auto-update trigger met automatische `ingediend_op` / `beoordeeld_op` bij status-overgang.

### Workflow
`concept` → `ingediend` (door medewerker) → `goedgekeurd` of `afgewezen` (door admin met opmerking)
Plus `geannuleerd` (door aanvrager).

### Files
- `verlof-data.js` — CRUD + workflow helpers (indienen/goedkeuren/afwijzen/annuleren) + sortering (pending eerst → start_datum asc → aanmaakdatum desc)
- `verlof.html` — tabs Mijn/Alle, filters status/type, gearchiveerd toggle. Add-modal met medewerker-picker, type-dropdown, start/eind datum, aantal dagen numeric, status keuze (concept/direct indienen). Beoordeel-modal met preview + opmerking + Goedkeuren/Afwijzen buttons (rode/blauwe styling).
- `verlof.js` — render met conditional actions per status (Indienen/Beoordeel/Annuleer/Archive), status-pill badges met kleurcode per status

### Nav-update
`werkruimte.html#verlof` → `verlof.html` in alle HTML + top-nav-overflow.js.

## Block 8 — Instellingen + Notificatietypes

### Schema (`create_notification_types`)
```sql
public.notification_types (
  id text PK,
  naam text NOT NULL UNIQUE,
  beschrijving, kanaal CHECK (in_app|email|sms|push),
  default_aan boolean DEFAULT true,
  archived, aanmaakdatum, laatst_gewijzigd
)
```
+ 4 RLS auth-only + auto-update trigger.

### Seed (8 realistische types):
1. Nieuwe taak toegewezen (in_app)
2. Verlofaanvraag ingediend (in_app, voor goedkeurders)
3. Verlofaanvraag goedgekeurd (in_app, voor aanvrager)
4. Verlofaanvraag afgewezen (in_app, voor aanvrager)
5. Factuur te beoordelen (in_app)
6. Incident gemeld (in_app)
7. Nieuw beleidsdocument (in_app, default uit)
8. BHV-certificaat verloopt (email)

v2 zou `public.profile_notification_preferences` M2M toevoegen voor per-user opt-in.

### Files
- `notification-types-data.js` — CRUD voor het registry
- `instellingen.html` + `instellingen.js` — 2 tabs:
  - **Mijn profiel**: edit voornaam/achternaam (gebruikt bestaande `profilesDB.update()`). Email + rol read-only.
  - **Notificatietypes**: admin CRUD met search + archive toggle + add/edit modal (naam, beschrijving, kanaal, default-aan)

### Nav-update
`werkruimte.html#instellingen` → `instellingen.html` in alle HTML + top-nav-overflow.js.

## Cumulatief overzicht na deze sessie

### Alle werkruimte.html# hash-fragments zijn nu vervangen door dedicated pages:
- ~~werkruimte.html#beleid~~ → `beleid.html` (Block 2)
- ~~werkruimte.html#taken~~ → `taken.html` (Block 4)
- ~~werkruimte.html#organisatie~~ → `teams.html` (Block 5)
- ~~werkruimte.html#audit~~ → `audit.html` (Block 6)
- ~~werkruimte.html#verlof~~ → `verlof.html` (Block 7)
- ~~werkruimte.html#instellingen~~ → `instellingen.html` (Block 8)

(Alleen `werkruimte.html#kilometers` blijft als secundaire route bestaan, maar `Kilometers` in top-nav verwijst al naar de aparte `kilometers.html`.)

### Nieuwe Supabase tabellen in deze sessie:
- `beleidsdocumenten` (+ storage bucket)
- `taken`
- `teams`
- `medewerker_teams` (M2M)
- `verlof_aanvragen`
- `notification_types`

### Nieuwe HTML pages: 6 (beleid, taken, teams, audit, verlof, instellingen)
### Nieuwe JS data-lagen: 6 (beleidsdocumenten-data, taken-data, teams-data, audit-data, verlof-data, notification-types-data)

## Wat ontbreekt nog

### Quality (cosmetisch/consistentie)
- **Top-nav consistency**: mijn 6 nieuwe pages hebben simpele flat top-nav (geen dropdown sub-menus per module). Bestaande pages hebben full-dropdown style. Cosmetisch inconsistent maar functioneel gelijk.
- **Datum-format Home** (BS2-stijl "mei 11, 2026" i.p.v. dd-mm-yyyy hh:mm)
- **Initialen-avatars** in home nieuws-feed

### Functioneel
- **Audit auto-population**: triggers op andere tabellen die naar audit_log schrijven (v2). Vereist generic `audit_log` tabel + triggers per resource-type.
- **Profile notification preferences**: M2M tabel + UI in instellingen voor per-user opt-in per notification_type
- **Email sturen** bij notification events — vereist Edge Function + email service integratie (uit scope BS1 patroon)
- **10 ontbrekende beleidsdocument volgnummers** (01-08, 24-25) — quick win, user kan zelf toevoegen via beleid.html

### Niet kritisch
- Profile voornaam ophalen via Supabase Auth metadata in plaats van profiles tabel
- Test data voor de nieuwe tabellen (taken, teams, verlof) zodat de demo-pages content tonen
