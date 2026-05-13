# Item 44 — Sprint 2: RLS hardening kritieke tabellen

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S2 in `../v2-master-plan.md`
**Gerelateerd**: items 39 (RLS audit), 40 (GDPR Art. 9)

## Wat is gedaan

GDPR Art. 9 compliance + cliënt-PII bescherming. 5 tabellen krijgen rol-gebaseerde RLS i.p.v. de eerdere "geauthenticeerde wildwest" (`using true`).

### Helper-functies (Supabase MCP migration)

| Helper | Returns true voor rollen |
|---|---|
| `is_admin(user_id uuid)` | profile.rol='admin' OF rol_id in (Admin, Eigenaar, Directeur) |
| `is_hr()` | Admin/Eigenaar/Directeur/HR/Salarisadministratie |
| `is_begeleider()` | Admin/HR + Planner/Cliëntbeheer/Teamleider/Medewerker/Gedragswetenschapper |
| `is_eigen_medewerker(text)` | true als opgegeven medewerker_id = current users medewerker_id |

`is_admin` is upgraded (was: alleen profiles.rol='admin' enum) om óók rol_id te respecteren — backward-compat met S1 koppeling.

### Tabellen + policies

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `verzuim` | admin+hr | admin+hr | admin+hr | admin |
| `medewerker_verzuim_perioden` | admin+hr+eigen | admin+hr | admin+hr | admin |
| `medewerker_documenten` | admin+hr+eigen | admin+hr+eigen | admin+hr | admin+hr |
| `medewerker_notities` | admin+hr | admin+hr | admin+hr | admin+hr |
| `clienten` | admin+hr+begeleider | admin+hr+begeleider | admin+hr+begeleider | admin+hr |

### Bestaande policies opgeruimd

Alle oude `"auth: anon kan X lezen/toevoegen/bewerken/verwijderen"` policies gedropt + vervangen door rol-specifieke namen (`<tabel>_<verb>_<scope>`).

## Compliance impact

✅ GDPR Art. 9 lid 3 — medische data (verzuim) is nu beperkt tot HR/admin
✅ Cliënt-PII alleen voor begeleidende functies + HR/admin
✅ Personeelsdossier (documenten) — alleen eigen + HR/admin
✅ HR-notities — privé voor HR (medewerker zelf ziet ze niet)

## Wat NIET breakt

- Admin-user (huidige logged-in user) heeft `profiles.rol='admin'` ÉN `rol_id='Admin'` → `is_admin()`=true → bypass alle policies via `using (is_admin(auth.uid()) OR ...)`
- BS1-UI blijft werken voor admin
- Service-role (Node scripts) blijft RLS bypassen (default)

## Wat WEL breakt (gewenst)

- Toekomstige users met rol = "Medewerker" zien geen andermans verzuim/documenten/notities
- Toekomstige users zonder begeleidende rol zien geen cliënten

## Volgende stappen (Sprint 3)

Sprint 3 = RLS hardening salaris + uren tabellen (salarisschalen, urendeclaraties, comp_saldi, saladmin_*).

## Test plan

- [ ] CI groen (geen JS-wijzigingen)
- [ ] Vercel deploy slaagt
- [ ] Admin user kan nog steeds verzuim/clienten/medewerker_documenten zien (via is_admin bypass)
- [ ] Geen 403-errors in BS1 console-log
- [ ] Toekomstige test: nieuwe user met rol "Medewerker" → kan eigen documenten zien, niet andermans

## Master-plan status

S2: ⏳ TODO → 🟡 IN PROGRESS → bij merge: ✅ DONE.
Sprint 3 (RLS salaris + uren) start direct na merge.
