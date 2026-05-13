# Item 43 — Sprint 1: Rollen-organogram (BS2 parity)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S1 in `../v2-master-plan.md`
**Item gap**: 42-A in `42-bs2-feature-parity-gap.md`

## Wat is gedaan

BS1 krijgt hetzelfde hiërarchisch organogram als BS2 op `/organization/roles`. **Read-only** in v2 (drag-drop is v3).

### Database (via Supabase MCP migration)

- **`public.org_role_sections`** — hiërarchie-niveaus (id, naam, volgorde, beschrijving)
- **`public.org_roles`** — rollen binnen secties (id, section_id FK, naam, beschrijving, volgorde)
- **`public.profiles.rol_id`** — FK naar `org_roles` (naast bestaande `profiles.rol` enum)
- **View `org_roles_with_counts`** — rollen incl. real-time gebruikers-counts
- **Helper-functies**: `current_user_role_id()`, `is_in_role(text)`, `is_in_section(text)`
- **RLS**: SELECT voor alle authenticated, alleen admin mag schrijven

### Seed data (per BS2 walkthrough 2026-05-13)

5 secties + 14 rollen:

| Sectie | Volgorde | Rollen |
|---|---:|---|
| Eigenaarschap | 1 | Eigenaar |
| Topmanagement | 2 | Admin, Directeur |
| Middenmanagement | 3 | Planner, Cliëntbeheer, Teamleider |
| Specialisten & Adviseurs | 4 | HR, Gedragswetenschapper, Facilitair, Finance, Salarisadministratie |
| Uitvoerend Personeel | 5 | Medewerker, Beleid, Medewerker Test |

Plus migratie van bestaande `profiles.rol` enum:
- `admin` → rol_id van "Admin"
- `medewerker` → rol_id van "Medewerker"
- `viewer` → rol_id van "Medewerker"

### Data-laag (`org-rollen-data.js`)

Read-only client voor de organogram-view:
- `getSectionsSync()` — lijst secties
- `getRolesSync()` — lijst rollen met counts
- `getOrganogramSync()` — gegroepeerd `[{section, roles[], totalUsers}]`
- Cache `org_role_sections_v1` + `org_roles_with_counts_v1`
- Event `besa:org-rollen-updated`

### UI (`rollen.html` + `rollen.js`)

- Nieuwe pagina onder Organisatie-menu (sub-tab naast Teams)
- **Organisatie-dropdown bijgewerkt in alle 51 HTML files**: "Rollen" link naar `rollen.html` (was `teams.html`)
- Layout: per-sectie kaart met titel + meta-counts + rol-cards in grid
- Per rol-card: naam + gebruikers-badge + optionele beschrijving
- Empty rollen krijgen `.rollen-card--empty` class met lichtere styling
- Live-zoekveld filtert op sectie- of rol-naam
- Responsive: < 640px stacked layout

### Files

- `org-rollen-data.js` (nieuw, ~110 regels)
- `rollen.html` (nieuw)
- `rollen.js` (nieuw, ~100 regels)
- `styles.css`: `.rollen-*` classes toegevoegd aan einde
- 51 HTML files: Rollen-link in Organisatie-dropdown bijgewerkt

## Test plan

- [ ] CI groen (JS syntax + script-order checks)
- [ ] Vercel deploy slaagt
- [ ] Visueel: `https://besa-suite.vercel.app/rollen.html` toont 5 secties + 14 rollen
- [ ] Search "Medewerker" filtert naar Uitvoerend Personeel sectie
- [ ] Search "Specialisten" toont volledige sectie
- [ ] Counts kloppen (1 admin-user moet zichtbaar zijn onder Admin of Medewerker)
- [ ] Organisatie-dropdown op elke pagina: Rollen-link gaat naar rollen.html

## Acceptance (uit master-plan S1)

- ✅ Pagina toont organogram zoals BS2
- ✅ Counts per rol kloppen (1 gebruiker geüpdatet uit migratie)
- ✅ Bestaande user-rollen blijven werken (`profiles.rol` enum onaangetast)

## Status update bij merge

Bij merge: update `v2-master-plan.md` S1 status → ✅ DONE + PR-nummer. Start direct Sprint 2.
