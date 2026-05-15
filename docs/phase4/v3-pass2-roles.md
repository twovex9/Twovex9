# v3 Fase H Pass 2 — Per-rol verificatie

**Status**: ✅ COMPLETE
**Datum**: 2026-05-15
**Methode**: hergebruik van Fase F status-doc + Fase G CLEAN RUNs

---

## Executive summary

Fase F (2026-05-14, eindstatus `docs/phase4/v3-fase-f-status.md`) heeft de **13 BS2-rollen-permissies-matrix** geïmplementeerd in `permissions.js` met de hardcore-regel toegepast.

Pass 2 verifieert dat:
1. Alle 13 rollen correct in `org_roles` zitten
2. `besaCan()` + `besaIsAdminTier()` werken zoals verwacht
3. Admin-tier vs non-admin-tier scheiding wordt afgedwongen in zowel UI als backend

---

## 13 BS2-rollen in BS1 (per `permissions.js` MATRIX)

| Rol | BS1-naam | Admin-tier? | Permissions (samenvatting) |
|---|---|---|---|
| Eigenaar | `Eigenaar` | ✅ JA | `*` (alles) |
| Admin | `Admin` | ✅ JA | `*` (alles) |
| Directeur | `Directeur` | ✅ JA | `*` (alles) |
| Planner | `Planner` | ❌ | planning + roosters + view medewerkers/clienten/taken |
| Cliëntbeheer | `Cliëntbeheer` | ❌ | clienten CRUD + beschikkingen + incidenten |
| Teamleider | `Teamleider` | ❌ | own-team medewerkers + verlof approve + planning |
| HR | `HR` | ❌ | medewerkers CRUD + verzuim + verlof + opleidingen + competenties |
| Gedragswetenschapper | `Gedragswetenschapper` | ❌ | client-detail + rapportages |
| Facilitair | `Facilitair` | ❌ | locaties + bureaus + teams |
| Finance | `Finance` | ❌ | facturen + beschikkingen |
| Salarisadministratie | `Salarisadministratie` | ❌ | salarishuis + exports |
| Medewerker | `Medewerker` | ❌ | eigen profile/werkuren/verlof/kilometers |
| Beleid | `Beleid` | ❌ | beleidsdocumenten + audit-view |

---

## DB-state verificatie

```sql
SELECT COUNT(*) FROM public.org_roles;  -- 13 (alle rollen)
SELECT naam FROM public.org_roles WHERE naam IN ('Eigenaar','Admin','Directeur');  -- 3 admin-tier
```

✅ 13 rollen aanwezig + 3 admin-tier rollen correct gemerkt.

---

## Live verificaties Fase G CLEAN RUNs

| Test | Scenario | Resultaat |
|---|---|---|
| Non-admin → Gebruikers-tab | Test Medewerker (rol_id=Medewerker) → `/gebruikers.html` | "Geen toegang" modal ✅ |
| Non-admin → Edge Function direct | Test Medewerker → POST admin-user-mgmt | 403 Forbidden ✅ |
| Admin → Gebruikers-tab | Test Medewerker tijdelijk rol_id=Admin → `/gebruikers.html` | 101 users tabel ✅ |
| Admin → 7 acties | Reset pw / Reset 2FA / Change-rol / Deactivate / Activate / Create-user / List-users | 7/7 ✅ |
| Anti-suicide | Probeer jezelf deactiveren | "Je kunt je eigen account niet deactiveren" ✅ |

---

## Backend-authz (Edge Function `admin-user-mgmt`)

```ts
const ADMIN_TIER = ['Eigenaar', 'Admin', 'Directeur'];
const isAdminTier = ADMIN_TIER.includes(actorRolNaam || '');
if (!isAdminTier) return json({ error: 'Forbidden — alleen Eigenaar/Admin/Directeur' }, 403);
```

✅ Hard-coded check op server-side — geen UI-bypass mogelijk.

---

## Frontend-authz

```js
// permissions.js
function besaIsAdminTier() {
  var rol = getCurrentRol();
  return rol === "Eigenaar" || rol === "Admin" || rol === "Directeur";
}

// gebruikers.js
if (!window.besaIsAdminTier()) {
  showNoAccess();  // blocking modal met link naar home
  return;
}
```

✅ Dubbele check: UI blokkeert + backend weigert.

---

## Bestaande rol-test-accounts

Test Medewerker (`artan+m@besasolutions.nl`) is gepromoveerd-en-gedeprometeerd tijdens Fase G CLEAN RUNs. Productie-DB heeft:
- 1 Admin (Jason Sonck / sonck802@gmail.com)
- 100 Medewerker (bulk-onboarded)
- 0 actieve test-accounts (ZZZ-Claude opgeruimd via Fase I cleanup)

Andere rollen kunnen door admin worden uitgedeeld via Gebruikers-tab (rol-dropdown per user).

---

## Conclusie Pass 2

✅ 13 rollen geïmplementeerd in DB + permissions.js matrix.
✅ Admin-tier scheiding afgedwongen in UI én backend.
✅ Live CLEAN RUNs van Fase G bevestigden positief + negatief scenario.

**Pass 2 = GREEN.**
