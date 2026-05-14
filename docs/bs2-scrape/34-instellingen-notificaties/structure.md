# Module 34 — Instellingen / Notificaties — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/settings/notification-types`
**BS1 URL**: `https://besa-suite.vercel.app/instellingen.html` (Notificatietypes-tab + Mijn notificaties-tab)
**Scrape datum**: 2026-05-14

## BS2 page

- Title: "Embrace The Future"
- h1: "Notificatie-instellingen"
- 3 sub-tabs (in Instellingen): Gebruikers / Entiteiten / Notificaties
- **Category-tabs** (5): HR / Cliënten / Planning / Financiën / Taken (HR default-active)
- Per category meerdere notification-type cards met:
  - Title + beschrijving
  - "Verstuur via e-mail" toggle
  - Users multi-select field (configurable recipients)
  - Rollen multi-select field
  - "Wijzigingen opslaan" button per type

### BS2 HR-category notification types (7)

1. **Kilometerdeclaratie ingediend** — kilometervergoeding indient ter beoordeling
   - Users: None / Rollen: Planner, HR
2. **Vakantie aanvraag ingediend** — verlofaanvraag indient ter beoordeling
   - Users: Zayn El Tayeb / Rollen: Planner, HR
3. **Ziekte gemeld** — nieuwe ziekteverzuim gemeld
   - Users: Zayn El Tayeb / Rollen: Planner, HR
4. **UWV registratie herinnering** — UWV deadlines voor ontslagen medewerkers
   - Users: Valerie Koster / Rollen: HR
5. **Verlofbalans verloopt** — wettelijk of bovenwettelijk verlofbalans verloopt binnen 3 maanden
   - Users: Valerie Koster / Rollen: HR
6. **Wet Poortwachter mijlpaal herinnering** — naderende Wet Poortwachter mijlpalen
   - Users: Valerie Koster / Rollen: HR
7. **Documenten medewerker verlopen** — documenten medewerker binnenkort verlopen
   - Users: Valerie Koster / Rollen: HR

## BS1 mirror

- Title: "Instellingen — HR"
- 5 tabs (BS1 superset): Mijn profiel / Gebruikers / **Mijn notificaties** / **Notificatietypes** / Entiteiten
- BS2 had 3 tabs (Gebruikers/Entiteiten/Notificaties); BS1 splitst "Notificaties" in:
  - **Mijn notificaties** (user-prefs per type aan/uit) — BS1 extra feature
  - **Notificatietypes** (admin-config) — BS2 mirror

### BS1 Notificatietypes-tab

- Table met 5 kolommen: Naam / Beschrijving / Kanaal / Default aan / Acties
- Per row: Edit-knop (link-button) + Archive-knop (trash)
- Toolbar: Search / Gearchiveerd-toggle
- Modal `inst-nt-modal` voor edit (Notificatietype bewerken)
  - Velden: id (hidden) / naam (text) / kanaal (select: email/in-app) / default-aan (checkbox)

### BS1 8 notification types (uit DB)
1. BHV-certificaat verloopt binnenkort
2. Factuur te beoordelen
3. Incident gemeld
4. Nieuw beleidsdocument
5. Nieuwe taak toegewezen
6. Verlofaanvraag afgewezen
7. Verlofaanvraag goedgekeurd
8. Verlofaanvraag ingediend

## BS1 modals

| Modal-ID | Class | Doel |
|---|---|---|
| `inst-nt-modal` | `emp-verzuim-modal-overlay` (display) | Notificatietype bewerken |

Na Bug #68 fix: 3 close-ways (X / Escape / Overlay) ✅

## Bug gefixt

### Bug #68 (UI) — inst-nt-modal × 2 missing close-ways

`inst-nt-modal` had alleen X-button close. **Escape** + **Overlay-click** misten.

**Fix in instellingen.js**: globale `initGlobalCloseForInstNtModal()`:
- Globale Escape keydown-handler met visibility check (style.display)
- Per-modal overlay-click handler (e.target === modal)
- Modal-type: display-based (NIET hidden-attr)

## Schema

- **`public.notification_types`** (8 records)
  - id (text) / naam / beschrijving / default_aan (boolean) / kanaal (text: email/in-app) / archived (boolean) / aanmaakdatum / laatst_gewijzigd
- **`public.notifications`** (in-app notifications dispatch)
  - id (uuid) / user_id / type / title / body / related_entity_type / related_entity_id / created_at
- **`public.notification_reads`** (per-user read-state)
  - id (uuid) / notification_id / user_id / read_at
- **`public.profile_notification_prefs`** (per-user per-type aan/uit, used in Mijn notificaties tab)

## v3 deferred (per user-keuze 2026-05-13)

- **GEEN e-mails ooit** (user expliciete eis). BS2 "Verstuur via e-mail" toggle + Users-receivers concept is **niet** overgenomen
- BS1 = in-app notification-bell only via `public.notifications` + Realtime
- BS2 category-grouping (HR/Cliënten/Planning/Financiën/Taken) is **niet** overgenomen — BS1 toont alle types in 1 lijst (geen tabs binnen Notificatietypes-tab)
