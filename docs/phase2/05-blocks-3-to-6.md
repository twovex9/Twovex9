# Phase 2 — Blocks 3-6: Nav-update + Taken + Teams + Audit

**Datum**: 2026-05-12
**Status**: ✅ Alle 4 blocks compleet, live op Vercel

## Overzicht

In één doorgaand werkblok (volgend op de eerste pre-flight + inventaris + Home/Nieuws sessie) zijn vier substantiële wijzigingen doorgevoerd:

1. **Block 3** — Nav-link update: `werkruimte.html#beleid` → `beleid.html` in 47 files
2. **Block 4** — Taken module (nieuwe gap-fill)
3. **Block 5** — Teams module (nieuwe gap-fill, met M2M medewerker_teams)
4. **Block 6** — Audit page (read-only viewer voor bestaande beschikking_audit_log)

Totaal: 3 nieuwe Supabase tabellen (taken, teams, medewerker_teams), 1 read-only viewer-page, 9 nieuwe code-files, ~250 BS1-files met nav-updates voor 4 sectie-overgangen (Beleid, Taken, Organisatie, Audit).

## Block 3 — Nav-link update voor Beleid

**Commit**: `9e8b1c5`

- `werkruimte.html#beleid` → `beleid.html` in 46 HTML files + top-nav-overflow.js
- Live geverifieerd: top-nav "Beleid" linkt nu naar `/beleid.html` op elke pagina (incl. overflow-menu)

## Block 4 — Taken module

**Commit**: `5fd1cba`

### Schema (`mcp__supabase__apply_migration` create_taken)
```sql
public.taken (
  id text primary key,
  naam text not null,
  beschrijving text,
  toegewezen_aan_id uuid REF medewerkers ON DELETE SET NULL,
  aangemaakt_door_id uuid REF auth.users ON DELETE SET NULL,
  status text CHECK (open|in_progress|voltooid|geannuleerd) DEFAULT 'open',
  prioriteit text CHECK (laag|midden|hoog) DEFAULT 'midden',
  deadline date,
  voltooid_op timestamptz,  -- auto-set bij status='voltooid' via trigger
  archived, aanmaakdatum, laatst_gewijzigd
)
```
+ 4 RLS policies (auth-only) + auto-update trigger met voltooid_op auto-set.

### Files (3 new)
- `taken-data.js` — CRUD + setStatus + getForMedewerkerSync
- `taken.html` — tabs Mijn/Alle, filters, add/archive/purge modals
- `taken.js` — render + filter wiring + status-pill click-to-advance

### Nav update
`werkruimte.html#taken` → `taken.html` in 48 files.

### Live
`/taken.html` op Vercel deploy 5fd1cba. Tabs + dropdowns operationeel.

## Block 5 — Teams module

**Commit**: `1a6d0bf`

### Schema (`create_teams`)
```sql
public.teams (id uuid, naam, beschrijving, team_leider_id, locatie_id, archived, ...)
public.medewerker_teams (
  medewerker_id, team_id, rol_in_team CHECK (lid|leider|assistent),
  PRIMARY KEY (medewerker_id, team_id)
)
```
+ 4 + 4 RLS policies + indexes + auto-update trigger.

### Files (3 new)
- `teams-data.js` — Team CRUD + members API (addMember/removeMember/setMemberRole) + getTeamsForMedewerkerSync, separate cache keys voor teams en members
- `teams.html` — list, add/edit modal (naam + leider + locatie), leden-modal (M2M management)
- `teams.js` — render + member-list rendering + role-edit + add/remove member

### Nav update
`werkruimte.html#organisatie` → `teams.html`. **Belangrijke distinctie**: BS1 had al `organisatie.html` voor `public.organisaties` (cliënt-related organizations). Die blijft toegankelijk via de Cliënten-sidebar. De nieuwe `teams.html` is voor BS2's "Organisatie/Teams" concept (medewerker-groepering).

## Block 6 — Audit page

**Commit**: `8d28165`

### Geen nieuwe tabel (v1)
Bestaande `public.beschikking_audit_log` (1 row) is de bron. v2 zou een generic `public.audit_log` kunnen toevoegen met triggers op meerdere tabellen.

### Files (3 new)
- `audit-data.js` — read-only fetcher (laatste 500 entries, gesorteerd t desc)
- `audit.html` — viewer met filters resource/actie, search, paginatie
- `audit.js` — render + kleur-coded badges (actie + status)

### Nav update
`werkruimte.html#audit` → `audit.html`.

### Live
`/audit.html` toont de bestaande 1 audit-entry: 08-05-2026 10:22:47, Beschikking, b_besc_089, bekijken, succes.

## Cumulatieve impact

| Metric | Voor sessie | Na sessie |
|---|---|---|
| Supabase tabellen | 41 | 44 (taken, teams, medewerker_teams + beleidsdocumenten uit Block 2) |
| Storage buckets | 2 (client-documents, medewerker-documenten) | 3 (+ beleidsdocumenten) |
| BS1 HTML pages | 35 | 39 (+ beleid.html, taken.html, teams.html, audit.html) |
| BS1 JS data-lagen | 37 | 41 (+ beleidsdocumenten-data, taken-data, teams-data, audit-data) |
| Top-nav broken links | 7 (werkruimte hash-fragments voor Taken/Beleid/Audit/Organisatie/Verlof/Instellingen/Kilometers) | 3 (Verlof, Instellingen, Kilometers nog) |

## Wat ontbreekt nog (volgende sessie)

### Hoge prio
1. **Verlof aanvragen** module — geen tabel `verlof_aanvragen` in BS1 (alleen `medewerker_verlof_overgedragen` saldo)
2. **Instellingen page** consolidatie — generic settings + notification_types
3. **Audit auto-population** triggers — schrijf entries naar audit_log bij CRUD op andere tabellen
4. **Top-nav consistency** — mijn 4 nieuwe pages hebben simpele flat top-links; oude pages hebben dropdown-menus per module. Niet blokkerend maar cosmetisch inconsistent.

### Lage prio
5. 10 ontbrekende beleidsdocument volgnummers (01-08, 24-25) — BS2 docs pagina 2 was niet ingeladen tijdens capture, user kan zelf toevoegen via beleid.html UI
6. Profile voornaam-fix — user kan zelf voornaam invullen in profielen, of klein code-patch in home.js voor mooiere email→naam fallback
7. Home polish: BS2-stijl datum-format ("mei 11, 2026" i.p.v. "11-05-2026 10:00") + initialen-avatars per nieuwsitem

## Lessons learned

- **Mass-update via `sed`** voor nav-links is efficiënt; CRLF-warnings van git zijn cosmetisch en niet blocker
- **Module-template patroon** (data-laag + html + js + nav-update) is herhaalbaar binnen ~30 minuten per module dankzij bestaande patronen (medewerker-documenten-data.js, competenties.html)
- **Race condition tussen render() en bootstrap fetchAll** is een terugkerende valkuil — `ready.then(render)` is essentieel om initiële empty-state te overschrijven met live data
- **Top-nav consistency**: mijn nieuwe pages gebruiken een vereenvoudigde top-nav (zonder dropdown-sub-menus) voor snellere build. De full-dropdown-style is uitstekend voor consistentie als prioriteit verschuift naar UX-finishing
- **Storage bucket policies** (RLS op `storage.objects` met `bucket_id = '<bucket>'`) zijn de gebruikelijke patroon voor BS1's public-bucket aanpak
