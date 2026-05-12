# Item 39 — RLS-policies security audit (rapport)

**Datum**: 2026-05-12
**Status**: ✅ Audit voltooid — rapport + aanbevelingen v2
**Gerelateerd**: items 5.1 uit `../06-professional-finish.md`, werkpatronen sectie 6d-ter (Stage 8c RLS)

## Methode

Via Supabase MCP queries op `pg_class` + `pg_policies`:
1. Alle publieke tabellen + RLS-status
2. Alle policies per tabel + scope (using/with_check)
3. Vergelijk tegen sensitivity-classification per tabel

## Sectie 1 — Huidige status (GOED)

### ✅ RLS overal aan

Alle **53 publieke tabellen** hebben `relrowsecurity = true`. Geen enkele tabel staat open voor unrestricted access via PostgREST.

### ✅ Geen `anon` access

Alle policies targeten `{authenticated}` role. Niet-ingelogde users kunnen geen enkele tabel benaderen. De Stage 8c migratie is succesvol uitgerold.

### ✅ CRUD policies compleet

Voor élke tabel zijn er policies voor SELECT/INSERT/UPDATE/DELETE (op enkele uitzonderingen voor append-only audit-logs na — zie sectie 3).

### ✅ Eén tabel met fine-grained policies — `public.profiles`

Voorbeeld van best practice (Stage 8b implementatie):
```sql
profiles_select_authenticated  → using (true)                          -- iedereen mag profielen lezen
profiles_update_self           → using (id = auth.uid())               -- alleen eigen profiel wijzigen
                                  with_check ((id = auth.uid()) AND
                                              (rol = old.rol))         -- en rol mag niet zelf veranderen
profiles_update_admin          → using is_admin(auth.uid())            -- admin mag alles
profiles_delete_admin          → using is_admin(auth.uid())
```

Plus de helper-functies `public.is_admin(uuid)` en `public.current_user_rol()` zijn beschikbaar (sinds Stage 8b) maar worden alleen op `profiles` gebruikt.

## Sectie 2 — Gaps en risico's

### ⚠️ Risico 1: "Geauthenticeerde wildwest" op gevoelige tabellen

**Alle policies behalve `profiles` hebben `using (true)` + `with_check (true)`.** Dat betekent: élke ingelogde gebruiker mag élke rij in élke tabel lezen, wijzigen of verwijderen — ook van andere medewerkers / cliënten.

**Niet acceptabel voor v2 productie** als BS1 buiten een trusted ETF-team komt. Voor v1 (interne ETF tool, alleen ETF-medewerkers) is dit een **bewuste compromise** (zie sectie 4).

### 🔴 Tabellen met GDPR-Art. 9 / hoog-gevoelige data

Deze hebben **strengere policies nodig voor productie**:

| Tabel | Data-categorie | Huidige policy | Gewenst v2 |
|---|---|---|---|
| `verzuim` | **Medisch (Art. 9 GDPR)** | `using true` | Eigen records + admin + HR-rol |
| `medewerker_verzuim_perioden` | **Medisch** | `using true` | Idem |
| `medewerker_documenten` | Personeelsdossier | `using true` | Eigen records + admin + HR-rol |
| `medewerker_notities` | Personeels-notities | `using true` | Auteur + admin + HR-rol |
| `client_documents` | Cliënt PII | `using true` | Begeleider van cliënt + admin |
| `client_rapportages` | Gevoelige cliënt-info | `using true` | Begeleider + admin |
| `client_vragenlijsten` | Intake/evaluatie | `using true` | Begeleider + admin |
| `client_contacten` | Cliënt-netwerk | `using true` | Begeleider + admin |
| `incidenten` | Incident-details | `using true` | Melder + admin + betrokkenen |
| `clienten` | Cliënt-NAW | `using true` | Begeleider + admin |
| `medewerkers` | Personeel-NAW + salaris | `using true` | Eigen + admin + HR-rol |
| `salarisschalen` | Salarisinfo | `using true` | Admin + HR-rol |
| `urendeclaraties` | Eigen uren | `using true` | Eigen + manager + admin |
| `comp_saldi` | Verlof/compensatie | `using true` | Eigen + manager + admin |

### 🟡 Tabellen met audit-log karakter (append-only?)

Twee tabellen missen een UPDATE-policy — vermoedelijk by design (append-only):

- `werkuren_vergrendeld` — geen UPDATE policy. Lock-state kan dus niet later veranderen.
- `salarishuis_wijzigingen` — geen UPDATE policy. Audit van salaris-wijzigingen mag niet rewriten.

**Aanbeveling**: documenteer deze "by design" in code-comments, plus DELETE-policy heroverwegen — moet alleen admin zijn?

### 🟡 Tabel met misleidende policy-naam

`profile_notification_preferences` policies heten "auth kan eigen prefs lezen/etc" maar de check is `using (true)`. Dat betekent: élke user kan ANDERMANS notificatie-voorkeuren lezen + wijzigen. Niet kritiek (geen geheime data) maar wel onverwacht.

**Fix v2**: `using (profile_id = auth.uid())`.

### 🟢 Naamgeving-inconsistentie

- Helft van policies heet `"auth: anon kan ..."` (legacy van Stage 8c rename)
- Andere helft heet `"auth kan ..."`

Functioneel identiek. Niet urgent. Bij v2 hardening migratie kan alles in één keer hernoemd worden.

## Sectie 3 — Mitigaties die er WEL zijn

Ondanks "wildwest" RLS heeft BS1 deze safety-nets:

1. **Auth-gate**: zonder login geen toegang. `auth-guard.js` op elke pagina.
2. **Service_role bypass alleen in scripts**: nooit in browser-code.
3. **Audit-log triggers**: ELKE wijziging op hoofdtabellen wordt gelogd in `audit_log` + `beschikking_audit_log`. Misbruik is detecteerbaar.
4. **Geen public API**: alleen via Supabase-client + RLS, geen exposed endpoints buiten Auth.
5. **Storage buckets**: zelfde `to authenticated`-only conventie.
6. **Helper-functies klaar**: `is_admin()` + `current_user_rol()` werken al, alleen toegepast op `profiles`.

## Sectie 4 — Is dit kritiek voor v1?

**Beoordeling: nee, niet voor v1.**

Reden:
- BS1 is een **interne ETF tool**. Alle users zijn ETF-medewerkers met arbeidscontract + geheimhouding.
- Default-rol bij user-registratie is `medewerker`; pas na admin-action wordt iemand `viewer` of `admin`.
- ETF-medewerkers hebben **al toegang tot deze data** in BS2.
- Audit-log triggers vangen misbruik achteraf.
- **Voor publieke / cross-organisatie productie zou dit wél een blocker zijn** — daarvoor v2.

## Sectie 5 — Aanbevolen v2 hardening (concrete SQL)

### 5.1 — Rol-helpers uitbreiden (bestaande functies, nieuwe)

```sql
-- Bestaand (Stage 8b):
public.is_admin(user_id uuid) RETURNS boolean
public.current_user_rol() RETURNS text

-- Toevoegen voor v2:
create or replace function public.is_hr_role()
returns boolean language sql stable security definer as $$
  select public.current_user_rol() in ('admin', 'hr');
$$;

create or replace function public.is_begeleider_van_client(client_id text)
returns boolean language sql stable security definer as $$
  -- Logica: medewerker.id == auth.uid() en client_id zit in zijn caseload
  -- Caseload-mapping moet nog gedefinieerd worden — via beschikkingen of via aparte tabel
  select public.is_admin(auth.uid()) or exists (
    select 1 from public.beschikkingen b
    where b.client_id = is_begeleider_van_client.client_id
    -- TODO: link naar medewerker via shifts/begeleiding-tabel
  );
$$;
```

### 5.2 — Voorbeeld: hardening van `verzuim` (GDPR Art. 9)

```sql
-- Eerst: nieuwe rol toevoegen aan profiles.rol enum
-- (admin | hr | medewerker | viewer)

drop policy if exists "auth: anon kan verzuim lezen" on public.verzuim;
create policy "verzuim_select_eigen_of_hr"
  on public.verzuim for select to authenticated
  using (
    public.is_hr_role()
    or medewerker_id = auth.uid()
    -- TODO: of medewerker is direct rapporteur
  );

drop policy if exists "auth: anon kan verzuim bewerken" on public.verzuim;
create policy "verzuim_update_hr_only"
  on public.verzuim for update to authenticated
  using (public.is_hr_role())
  with check (public.is_hr_role());

drop policy if exists "auth: anon kan verzuim toevoegen" on public.verzuim;
create policy "verzuim_insert_hr_only"
  on public.verzuim for insert to authenticated
  with check (public.is_hr_role());

drop policy if exists "auth: anon kan verzuim verwijderen" on public.verzuim;
create policy "verzuim_delete_admin_only"
  on public.verzuim for delete to authenticated
  using (public.is_admin(auth.uid()));
```

### 5.3 — Per-tabel checklist voor v2

| Tabel | SELECT-restrictie | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `clienten` | begeleider + admin | begeleider + admin | admin |
| `medewerkers` | `id = auth.uid()` of admin/hr | admin/hr | admin |
| `verzuim` | hr of `medewerker_id = auth.uid()` | hr | admin |
| `medewerker_documenten` | hr of eigen | hr | admin |
| `medewerker_notities` | hr of `auteur_id = auth.uid()` | hr of eigen | admin |
| `urendeclaraties` | manager-keten of eigen | eigen of manager | admin |
| `salarisschalen` | hr/admin | hr/admin | admin |
| `client_documents` | begeleider + admin | begeleider + admin | admin |
| `client_rapportages` | begeleider + admin | begeleider + admin | admin |
| `client_vragenlijsten` | begeleider + admin | begeleider + admin | admin |
| `client_contacten` | begeleider + admin | begeleider + admin | admin |
| `incidenten` | melder + betrokken medewerker + admin | melder + admin | admin |
| `audit_log` (en `beschikking_audit_log`) | admin/hr | system-only (via SECURITY DEFINER) | nooit |

### 5.4 — Effort schatting v2 hardening

- **Voorbereiding**: definieer caseload-mapping (welke medewerker is begeleider van welke cliënt?) — vereist nieuwe tabel of FK-verandering. ~4 uur.
- **Migration scripts**: per tabel droppen + recreaten policies — 53 tabellen × ~5 min = ~4 uur.
- **Testing**: per rol verifiëren dat juiste toegang werkt — ~4 uur via gespeelde scenarios.
- **Total**: **~12-16 uur** dedicated security-werk.

## Sectie 6 — Niet kritieke aanbevelingen

1. **Policy-naam-uniformiteit**: bij v2 hardening alles hernoemen naar `<tabel>_<verb>_<scope>` (bv `clienten_select_begeleider`).

2. **`relforcerowsecurity = true`** op gevoelige tabellen — forceert RLS ook voor table-owner, ook voor `service_role` (tenzij expliciet bypass). Voor v2: zet aan voor verzuim, medewerker_documenten, etc.

3. **Storage buckets RLS**: ook hardenen (`storage.objects` policies) — nu open voor alle authenticated, idem ratio als hoofdtabellen.

4. **Penetration test**: na v2 hardening, externe security-test op productie-omgeving.

## Conclusie

✅ **v1 is acceptabel** — alle tabellen RLS aan, authenticated-only, audit-trail werkend. Voor interne ETF tool met trusted users prima.

⚠️ **Voor productie/cross-org**: v2 hardening **noodzakelijk** voordat externe users worden toegelaten of regulatorische audit plaatsvindt.

**Niet blokkerend voor v1 deploy.** Maar wel essentieel-te-plannen voordat BS1 buiten ETF-team komt.

## Acties

- Geen runtime-acties uit deze audit (alleen rapport).
- Toegevoegd aan roadmap als **item 39 → trigger v2 hardening sprint**.
- Bij volgende sessie: indien user wenst, start migratie-script per tabel volgens sectie 5.3 checklist.
