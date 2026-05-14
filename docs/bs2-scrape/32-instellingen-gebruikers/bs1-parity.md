# Module 32 — Instellingen / Gebruikers — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 ("Gebruikers" / "Instellingen") | ✅ | ✅ | functioneel ✅ |
| Tab-structuur (Gebruikers/Entiteiten/Notificaties) | 3 tabs | 5 tabs (incl Mijn profiel + Mijn notificaties) | BS1+ |
| Naam-kolom | ✅ | ✅ | ✅ |
| E-mailadres-kolom | ✅ | ✅ | ✅ |
| Rollen-kolom | ✅ | ✅ | ✅ |
| Status-kolom (badge) | ✅ | ✅ groen "Actief" | ✅ |
| Aanmaakdatum-kolom | ✅ | ✅ | ✅ |
| Kolommen-kiezer | ✅ | ✅ 4 toggleable (Naam skipToggle) | ✅ |
| Search input | ✅ | ✅ live filter | ✅ |
| Count display ("X van Y") | ✅ | ✅ | ✅ |
| Gebruiker toevoegen button | ✅ | ❌ (v3 Fase G) | v3-deferred |
| Gearchiveerd-toggle | ✅ | ❌ (no archived state) | n.v.t. |
| Multi-role display (Medewerker, Finance) | ✅ | ✅ via profiles.rol text | ✅ |
| Records-count | 120 users | 1 user (test-admin) | v3 Fase G |
| TD data-col attrs (Kolommen-hide werkt) | n.v.t. | ✅ | ✅ |
| Console errors | 0 | 0 | ✅ |

## BS1 superset features

1. **Mijn profiel tab** — wijzig eigen voornaam/achternaam voor welkomstgroet + audit-logs
2. **Mijn notificaties tab** — per notification-type aan/uit toggle
3. **Notificatietypes splitsing** — BS2 "Notificaties" tab is in BS1 gesplitst in:
   - Notificatietypes (admin-config, BS2 mirror)
   - Mijn notificaties (user-prefs, BS1 extra)
4. **Status badge kleurgecodeerd** (Actief = groen pill)
5. **(geen naam)** placeholder bij lege voornaam/achternaam

## v3 deferred items (niet Module 32 scope)

- **Fase G**: Bulk-onboarding 102 medewerker-profielen via `scripts/onboard-bs2-employees.mjs`
- **Fase G**: Admin-only Gebruikersbeheer-pagina (add/edit/deactivate/reset-password/reset-2FA)
- **Fase G**: 2FA enrollment-wizard
- **Fase G**: must_change_password + must_setup_2fa flags

## User-count gap explained

BS2 toont 120 users in /settings/users. BS1 toont 1 user (test-admin). Dit is **by design** voor current-phase:
- BS1 heeft alleen 1 `auth.users` account (test-admin) + 1 `public.profiles` rij
- 102 medewerker-records bestaan in `public.medewerkers` zonder bijbehorende auth-account
- v3 Fase G `scripts/onboard-bs2-employees.mjs` zal 102 auth-accounts + profiles aanmaken
- Niet een Module 32 bug → v3 Fase G item

## Conclusie

Module 32 is **100% functionele pariteit** met BS2 (read-only viewer current-phase). **0 bugs** gevonden. BS1 superset met 5-tab structuur (Mijn profiel + Mijn notificaties + Notificatietypes splitsing). CRUD-functionaliteit + 2FA + bulk-onboarding zijn v3 Fase G items.
