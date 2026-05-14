# Module 30 — Organisatie / Rollen — BEHAVIORS

## Initial render
- `bootstrap()` in org-rollen-data.js → parallel fetch:
  - `org_role_sections` (geordend op volgorde ASC)
  - `org_roles_with_counts` view (geordend op section_volgorde, dan volgorde)
- Cache in `localStorage`:
  - Key `org_role_sections_v1`
  - Key `org_roles_with_counts_v1`
- Event `besa:org-rollen-updated` (detail: source) → trigger re-render
- Cache-first render (snelle initial), background-fetch overschrijft cache

## Render flow
1. `DOMContentLoaded` → `renderOrganogram()` met cache
2. `orgRollenDB.ready` Promise → re-render na bootstrap (fresh data)
3. Live re-render bij `besa:org-rollen-updated` event

## Search
- Input `#rollen-search` met debounce 150ms
- Matcht op section-naam OF rol-naam (case-insensitive substring)
- Bij section-match → toon alle rollen in die sectie
- Bij rol-match → toon alleen die rol (binnen parent-sectie)
- Bij 0 matches → "Geen rollen of secties matchen \"X\"."
- Totaal-counter herberekend per filter

## Empty-state styling
- 0 gebruikers → `.rollen-card--empty` class (lichter accent)
- 1+ gebruikers → standaard `.rollen-card` styling

## CRUD (NIET in scope Module 30 — v3 Fase E)
- BS2 heeft: Opslaan / Reset / Nieuwe rol / Nieuwe sectie / drag-drop
- BS1 read-only viewer current-phase
- v3 Fase E zal drag-drop hiërarchie-editor toevoegen

## Data-flow
- Hoofdtabel: `public.org_role_sections` + `public.org_roles`
- View: `public.org_roles_with_counts` (joinst `profiles.rol_id` voor counts)
- Profile.rol_id → user telt mee in `gebruikers_count` voor de gekoppelde rol
- 1 profile currently (admin) → "Medewerker" rol counter = 1

## Events
- `besa:org-rollen-updated` event op window → triggert renderOrganogram()
- Source-detail: "cache" / "bootstrap" / "refresh"

## Geen modals in Module 30
- Read-only viewer, geen click-to-detail
- Geen archive/delete flows
- Geen edit-formulieren
- (Toekomstig v3 Fase E: rol-edit modal + sectie-edit modal + drag-drop)
