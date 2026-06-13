# Item 45 — Sprint 3: RLS hardening salaris + uren tabellen

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S3 in `../v2-master-plan.md`
**Gerelateerd**: items 39 (RLS audit), 44 (S2 RLS kritiek)

## Wat is gedaan

Vervolg op Sprint 2 — nu de salaris- en uren-tabellen krijgen rol-gebaseerde RLS. Wildwest `using (true)` policies vervangen door HR/admin (org-config) of begeleider+HR/admin (per-record).

### Tabellen + policies

| Tabel | SELECT | INSERT | UPDATE | DELETE | Rationale |
|---|---|---|---|---|---|
| `salarisschalen` | hr+admin | hr+admin | hr+admin | admin | Org-wide salaris-config |
| `salarishuis_wijzigingen` | hr+admin | hr+admin | — (audit) | admin | Audit-log salaris-wijzigingen |
| `saladmin_ort` | hr+admin | hr+admin | hr+admin | admin | Org-wide ORT-jaar-config |
| `comp_saldi` | begeleider+hr+admin | begeleider+hr+admin | begeleider+hr+admin | hr+admin | Compensatie-saldi per medewerker (text-naam, geen FK) |
| `urendeclaraties` | begeleider+hr+admin | begeleider+hr+admin | begeleider+hr+admin | hr+admin | Per cliënt (text-naam, geen FK) |
| `uren_budget` | begeleider+hr+admin | begeleider+hr+admin | begeleider+hr+admin | hr+admin | Per client_id (FK) |

### Helper-functies (al uit Sprint 2)

- `is_admin(auth.uid())` — admin/eigenaar/directeur (via rol_id of legacy enum)
- `is_hr()` — Admin/Eigenaar/Directeur/HR/Salarisadministratie
- `is_begeleider()` — Admin/HR + Planner/Cliëntbeheer/Teamleider/Medewerker/Gedragswetenschapper

## Per-record "eigen" check defer naar v3

`comp_saldi.medewerker` en `urendeclaraties.client` zijn **text-namen**, geen FK's naar medewerkers/clienten. Een policy-USING-expressie die "eigen medewerker zien" zou checken via naam-vergelijking is fragiel (typo's, naam-wijzigingen, etc.).

**v3-werk**: voeg `medewerker_id uuid` toe aan `comp_saldi` + backfill van bestaande rijen via naam-lookup → JOIN-vrij in policy: `medewerker_id = (select medewerker_id from profiles where id=auth.uid())`. Idem voor `urendeclaraties.client_id text` → FK naar clienten.

Voor v2: minimaal "geen wildwest" — `medewerker` zonder begeleidende rol kan geen salaris-data zien.

## Live verificatie (Chrome MCP)

Admin session via `futureflow-app.vercel.app`:

| Tabel | Count voor admin | RLS-error |
|---|---:|---|
| salarisschalen | 0 | nee |
| salarishuis_wijzigingen | 0 | nee |
| saladmin_ort | 0 | nee |
| comp_saldi | 81 | nee |
| urendeclaraties | 7 | nee |
| uren_budget | 0 | nee |

`is_admin()` bypass werkt → admin behoudt volledige toegang.

## Wat NIET breakt

- Admin (huidige user `sonck802@gmail.com`) heeft `profiles.rol='admin'` ÉN `rol_id='Admin'`
- BS1 `salaris-vakantieadministratie.html`, `salarisadministratie-exporter.html`, `salarisschalen.html`, `urendeclaraties.html`, `urendeclaraties-importeren.html` blijven werken
- Service-role (Node-scripts) bypasst RLS sowieso

## Wat WEL breakt (gewenst)

- Toekomstige user met rol = "Medewerker" (zonder begeleidende functie) → ❌ geen salaris-toegang
- Toekomstige user met rol = "Cliëntbeheer" → ✅ ziet `urendeclaraties` (begeleider-scope)
- Toekomstige user met rol = "HR" → ✅ ziet alle salaris/uren-tabellen

## Volgende stappen

Sprint 4: BS2 deep walk + implementatie Planning Voorinstellingen-save.

## Test plan

- [ ] CI groen (geen JS-wijzigingen)
- [ ] Vercel deploy slaagt
- [ ] Admin behoudt toegang via BS1 salaris-pagina's
- [ ] `urendeclaraties.html` toont 7 records
- [ ] `comp_saldi` toont 81 records voor admin
- [ ] Geen 403/401 errors in browser console

## Master-plan status

S3: ⏳ TODO → 🟡 IN PROGRESS → bij merge ✅ DONE. Direct na merge start Sprint 4.
