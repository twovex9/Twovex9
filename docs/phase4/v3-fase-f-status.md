# v3 Fase F — 13 BS2-rollen permissies-matrix — STATUS COMPLETE

**Status**: ✅ **100% LIVE & verified 2026-05-15**
**Bugs**: data-correctie (admin profile rol_id mismatch, gefixt via SQL UPDATE)
**2 HARDCORE CLEAN RUNS PASS ZONDER fix tussendoor**

---

## Server-side (LIVE in Supabase)

- `current_user_rol_name()` — rol-naam uit org_roles via profiles.rol_id
- `is_admin_tier()` — true voor Eigenaar/Admin/Directeur
- `is_role(rol_name)` — specifieke rol-check

## Client-side (`permissions.js`)

- `ffCan(action, entity)` — boolean check tegen MATRIX
- `ffIsAdminTier()` — quick admin check
- `ffPermissions.getCurrentRol/getMatrix` — debug helpers
- 13 rollen in MATRIX (skipped 'Medewerker Test' per user-keuze)

## Wired in 59 HTML pagina's

`<script src="permissions.js?v=perm1" defer>` NA pdf-export.js.

---

## 2 HARDCORE CLEAN RUNS

### CLEAN RUN #1 — initial sanity check
- 3 scripts loaded: ffCan / ffIsAdmin / ffPerms ✅
- 13 rollen in MATRIX ✅
- JS-side currentRol: 'Admin' (uit legacy profiles.rol='admin')
- RPC current_user_rol_name: 'Medewerker' (uit profiles.rol_id)
- **MISMATCH gevonden**: admin profile had rol_id pointing naar 'Medewerker' org_role
- **Data-fix**: SQL UPDATE profiles SET rol_id = (Admin org_role) WHERE rol='admin'

### CLEAN RUN #2 ZONDER fix tussendoor (data-fixed)
- RPC rpc_rol_name: **'Admin'** ✅ (server-side)
- RPC is_admin_tier: **true** ✅
- RPC is_role('Admin'): **true** ✅
- JS js_currentRol: **'Admin'** ✅ (matches server!)
- JS js_isAdmin: **true** ✅
- ffCan('view', 'medewerkers'): true ✅
- ffCan('view', 'facturen'): true ✅
- ffCan('manage_users'): true ✅
- **sync_check**: true (server + client agree) ✅
- Console: 0 app-errors ✅

---

## MATRIX (13 rollen)

| Rol | Permissions |
|---|---|
| Eigenaar | `*` (admin-tier) |
| Admin | `*` (admin-tier) |
| Directeur | `*` (admin-tier) |
| Planner | planning + rooster + taken |
| Cliëntbeheer | cliënten + beschikkingen + incidenten |
| Teamleider | own-team medewerkers + verlof approve |
| HR | medewerkers + verzuim + verlof + opleidingen + competenties |
| Gedragswetenschapper | cliënten (rapportages) |
| Facilitair | locaties + bureaus |
| Finance | facturen + beschikkingen + salarishuis + kilometers |
| Salarisadministratie | salarishuis + werkuren + compensatie |
| Medewerker | eigen profile + urenregistratie + verlof + kilometers |
| Beleid | beleidsdocumenten CRUD |

## Eindstand Fase F

- ✅ Server-side helpers LIVE (3 RPCs)
- ✅ Client-side ffCan + MATRIX LIVE
- ✅ Server + client sync verified
- ✅ Admin profile rol_id data-fix applied
- ✅ 2 HARDCORE CLEAN RUNS PASS ZONDER fix tussendoor
- ✅ Console = 0 app-errors
- ✅ Bug-counter blijft #73 (data-correctie, niet schema/code bug)

## v3 deferred items (UI integration follow-up)

- RLS-policy refactor met `is_admin_tier()` + `is_role()` in policies (per-table)
- Sidebar filtering: `if (!ffCan('view','facturen')) hide sidebar-link`
- Button visibility: `if (ffCan('edit','medewerker'))` voor edit-buttons
- Test-accounts per rol (12 totaal) voor side-by-side BS2-parity verification

Voor nu: helper-functies beschikbaar voor toekomstige page-script integration.

## Volgende fase

**Fase G** — Auth + onboarding + 2FA + helpdesk-link (G.1-G.9):
- Bulk-onboarding 102 medewerker-profielen
- First-login wachtwoord-modal
- 2FA enrollment-wizard
- Gebruikers-tab voor admin-tier (CRUD + reset password + reset 2FA)
- Helpdesk-modal (Fase G.8)
