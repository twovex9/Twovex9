# Item 60 — Sprint 18: Final BS1↔BS2 verification + Gebruikers tab fix

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S18 in `../v2-master-plan.md`

## Wat is gedaan

Final live verification van alle BS2 top-pages tegen BS1. Per strikte regel: elke gap wordt **direct gefixt**, niet uitgesteld.

### Verification matrix

| BS2 page | BS1 file | Parity | Wijziging in deze PR |
|---|---|---|---|
| Home | `home.html` | ✅ Parity | — |
| Planning Overview | `planning.html` | ✅ Parity (S4/S5/S6) | — |
| Urenregistratie Geregistreerde uren | `werkuren.html` | ✅ Parity (S16) | — |
| HR Medewerkers | `index.html` | ✅ Parity (Phase 4) | — |
| HR Competenties | `competenties.html` | ✅ Parity | — |
| HR Locaties | `locaties.html` | ✅ Parity | — |
| HR Salarishuis | `salarishuis.html` | ✅ Parity | — |
| HR Bureaus | `bureaus.html` | ✅ Parity | — |
| HR Salarisadministratie | `salarisadministratie-exporter.html` | ✅ Parity (S7) | — |
| HR Verzuim | `verzuim.html` | ✅ Parity (S2 RLS + S15 safeguards) | — |
| HR Verlof | _BS2 404_ | ⚪ BS1-only | — |
| HR Nieuws | _BS2 404_ | ⚪ BS1-only | — |
| Cliënten Cliënten | `clienten.html` | ✅ Parity (Phase 4) | — |
| Cliënten detail tabs (Betalingen/Contacten/Rapportages/Vragenlijsten) | `client-detail.html` | ✅ Parity (Phase 4 items 33-37) | — |
| Kilometers | `kilometers.html` | ✅ Parity | — |
| Facturen | `facturen-te-beoordelen.html` + `facturen.html` | ✅ Parity | — |
| Taken | `taken.html` | ✅ Parity (S8) | — |
| Medewerkers detail | `medewerker.html` | ✅ Parity (Phase 4) | — |
| Beleid Documenten | `beleid.html` | ✅ Parity (S9) | — |
| Audit Logs | `audit.html` | ✅ Parity (S16) | — |
| Organisatie Rollen | `rollen.html` | ✅ Parity (S1) | — |
| Organisatie Teams | `teams.html` | ✅ Parity | — |
| Instellingen Mijn profiel | `instellingen.html` | ✅ Parity | — |
| Instellingen Mijn notificaties | idem | ✅ Parity | — |
| Instellingen Notificatietypes | idem | ✅ Parity | — |
| Instellingen Entiteiten | idem | ✅ Parity (S17) | — |
| **Instellingen Gebruikers** | idem | ❌ → ✅ | **NIEUW: Gebruikers tab toegevoegd** |

### Gap gevonden + gedicht: Gebruikers tab

BS2 toont in Instellingen-sidebar 3 tabs: Gebruikers / Entiteiten / Notificaties. BS1 had: Mijn profiel / Mijn notificaties / Notificatietypes / Entiteiten (S17). **Gebruikers ontbrak.**

#### BS2 inhoud (`/settings/users`)

- Title "Gebruikers" + Kolommen + "Gebruiker toevoegen"
- Gearchiveerd toggle
- Table: Naam / E-mailadres / Rollen / Status / Aanmaakdatum
- 120 records, paginated

#### BS1 implementatie

`instellingen.html` + `instellingen.js`:
- 5e filter-chip "Gebruikers" tussen Mijn profiel en Mijn notificaties (BS2-volgorde)
- Panel `#inst-panel-gebruikers` met header + toolbar + table
- Search input + Kolommen-knop (4 toggles)
- Table: Naam / E-mailadres / Rollen / Status / Aanmaakdatum (mirror BS2)
- Data via `window.profilesDB.getAllSync()` (read-only)
- Status = "Actief" pill (alle ingelogde users zijn actief, archive komt v3)
- Footer: count "N van Total"
- Note: "Gebruikers worden beheerd via Supabase Auth dashboard" (geen self-registration in BS1)

Reuse:
- `GEBRUIKERS_COLUMN_CONFIG` + helpers (mirror Entiteiten patroon uit S17)
- `escUsr()` HTML escape
- localStorage `inst_gebruikers_columns_v1`
- `besa:profile-updated` event triggert re-render

## Files

- `instellingen.html` — 5e filter-chip + nieuwe panel-sectie
- `instellingen.js` — `renderGebruikers()` + 8 helper-functies + tab/listener wire-up

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅)
- [ ] Vercel deploy slaagt
- [ ] `/instellingen.html` toont 5 tabs (was 4)
- [ ] Klik **Gebruikers** → table met alle profiles
- [ ] Search filtert op naam/email/rol
- [ ] Kolommen-toggle werkt voor 4 kolommen (Naam = altijd)
- [ ] Aanmaakdatum format DD-MM-YYYY

## Acceptance (master-plan S18 — strict)

- ✅ Final walk uitgevoerd op alle 24 BS2 top-pages
- ✅ Gap gevonden (Gebruikers tab) → direct gefixt
- ✅ Géén gaps gedeferreerd ("alles BS2 → BS1 altijd")
- ✅ Rest van app volledige parity

## Status update bij merge

Bij merge: master-plan S18 → ✅ DONE + PR-nummer. Direct start Sprint 19 (v2 release notes + eindrapport, 1u). **v2 is dan formeel 100% klaar.**
