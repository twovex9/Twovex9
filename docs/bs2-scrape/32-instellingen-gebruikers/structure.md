# Module 32 — Instellingen / Gebruikers — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/settings/users`
**BS1 URL**: `https://futureflow-app.vercel.app/instellingen.html` (Gebruikers-tab)
**Scrape datum**: 2026-05-14

## BS2 page

- Title: "Gebruikers | Embrace The Future"
- h1: "Gebruikers"
- 3 sub-tabs (in Instellingen): Gebruikers / Entiteiten / Notificaties
- Toolbar: Kolommen / Gebruiker toevoegen / Gearchiveerd
- Table cols: Naam / E-mailadres / Rollen / Status / Aanmaakdatum
- 120 users totaal, RPP=15, 8 pagina's

### BS2 sample users (page 1, 15 zichtbaar)
- Rianne Hoppen (Medewerker, Actief, 06-05-2026)
- Naima El Kanddousi (Medewerker, Actief, 28-04-2026)
- Ilham Houfaty (Medewerker, Actief, 23-04-2026)
- Dario Tufano (Medewerker, Actief, 22-04-2026)
- Joel Joseph (Medewerker, Actief, 14-04-2026)
- Jason Sonck (Admin, Actief, 06-04-2026)
- Dennis Van Deelen (Medewerker, Finance — multi-role, Actief, 01-04-2026)
- Oumaima Achefay (Medewerker, Actief, 31-03-2026)
- ... + 7 meer

## BS1 mirror

- Title: "Instellingen — HR"
- h1: "Instellingen"
- 5 tabs (BS1 superset): Mijn profiel / **Gebruikers** / Mijn notificaties / Notificatietypes / Entiteiten
- BS2 had 3 tabs; BS1 voegt **Mijn profiel** + **Mijn notificaties** toe + splitst Notificaties in Notificatietypes (admin-config) vs Mijn notificaties (user-prefs)

### BS1 Gebruikers tab (`#inst-panel-gebruikers`)
- h2: Gebruikers
- Toolbar: Kolommen / Search "Zoeken..."
- Hint: "Gebruikers worden beheerd via Supabase Auth dashboard." (read-only viewer)
- Table cols (5): Naam / E-mailadres / Rollen / Status / Aanmaakdatum
- Footer: "X van Y" count
- 1 user actueel (test-admin, voornaam/achternaam leeg → "(geen naam)")

## BS1 modals in Gebruikers tab

**Geen modals in Gebruikers tab** — read-only viewer per current-phase design. CRUD gebeurt via Supabase Auth dashboard. Add/edit-flow komt v3 Fase G (bulk-onboarding 102 medewerker-profielen + Gebruikersbeheer-pagina admin-only).

(Andere modal `inst-nt-modal` op instellingen.html is voor Notificatietypes-tab — Module 34 scope, niet Module 32.)

## Schema

- `public.profiles` tabel (1 record)
- Kolommen: id (uuid → auth.users) / email / voornaam / achternaam / rol (text: admin/medewerker/viewer) / medewerker_id (uuid → medewerkers) / aanmaakdatum / laatst_gewijzigd / rol_id (uuid → org_roles)
- 1-op-1 met `auth.users` via auto-create trigger
- RLS: auth-only, admin-only voor rol-wijziging

## User-count gap

**BS2 toont 120 users, BS1 toont 1 user**. Dit is v3 Fase G bulk-onboarding item:
- Currently BS1 heeft alleen test-admin account in `auth.users`
- v3 Fase G: `scripts/onboard-bs2-employees.mjs` zal 120 user-records aanmaken op basis van actieve BS2 medewerkers
- Niet een Module 32 bug — by design in current-phase

## BS1 superset features

- **Mijn profiel tab** (BS1 extra) — naam wijzigen voor audit-logs welkomstgroet
- **Mijn notificaties tab** (BS1 extra) — per notification-type aan/uit toggle
- **Kolommen-kiezer** met data-col op TH én TD (4 toggleable + Naam skipToggle)
- **Search** filter live op voornaam/achternaam/email/rol
- **Count display** "X van Y" met filter-feedback (X kan minder zijn dan Y)
- **Status badge** kleurgecodeerd (Actief = groen)

## Geen bugs gevonden in Module 32

BS1 Gebruikers tab is functioneel correct als read-only viewer:
- TD-cellen hebben `data-col` attribuut → Kolommen-kiezer werkt op TH + TD
- Search filtert correct, count update real-time
- "(geen naam)" placeholder voor profile zonder voornaam/achternaam (expected behavior)
- Status "Actief" badge per profiel (BS2 toont hetzelfde)
- 5 tabs switch correctly via filter-chip role="tab"

User-count gap (120 vs 1) is v3 Fase G scope, niet Module 32 bug.
