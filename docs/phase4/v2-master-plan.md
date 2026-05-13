# v2 Master Plan — Stappenplan naar 100% BS2 parity

**Gemaakt**: 2026-05-13
**Doel**: dit document is het **bindende stappenplan** voor BS1 → 100% feature-parity met BS2. Vanaf hier voert Claude autonoom de stappen uit zonder per stap een keuze-vraag te stellen.

> **REGEL VOOR CLAUDE (zichzelf én volgende sessies)**:
> - Bij start van elke sessie eerst dit document lezen
> - Identificeer de **eerste sprint met status `⏳ TODO`** of `🟡 IN PROGRESS` hieronder
> - Begin direct met die sprint via feature-branch + PR
> - Geef user de merge-link
> - **NOOIT vragen** "welke wil je volgende?" — sprints zijn in vaste volgorde
> - Na merge: ga naar volgende `⏳ TODO` sprint
> - Update status in dit document tijdens elke PR

> **REGEL VOOR USER**:
> - Mergen via GitHub. Klaar.
> - Tussendoor vragen blijven welkom (bv. "deze sprint anders volgorde"), maar default = stilte = vertrouw Claude

## Sessie-protocol (vast)

Bij elke nieuwe sessie:

1. Read `besa-suite-etf/CLAUDE.md` (auto-load)
2. Read `docs/phase4/99-v1-eindrapport.md` (state)
3. Read **dit document** (next step)
4. Read `docs/phase4/open-items/README.md` (open items index)
5. Find first sprint status `⏳ TODO` of `🟡 IN PROGRESS`
6. Execute sprint as 1 PR
7. Give merge link
8. On merge confirmation: update status → `✅ DONE`, **doe Chrome MCP live verificatie** (zie regel hieronder), move to next

## 🚨 Live Chrome MCP verificatie per sprint (regel sinds 2026-05-13)

User-quote: *"Het is wel belangrijk dat je zelf de extensietool op Google Chrome gebruikt om dit zelf ook te controleren. Ik ga dit niet controleren."*

Na elke merge MOET Claude zelf via `mcp__Claude_in_Chrome__*` tools verifiëren op `https://besa-suite.vercel.app`:

1. `navigate` naar wijzigde pagina('s)
2. `get_page_text` + `read_page` → content rendert?
3. `read_console_messages onlyErrors:true` → 0 JS-errors?
4. UI-changes → ook screenshot/visuele check
5. Data-changes → query via Supabase MCP

Resultaat in 1-2 regels naar user (of in PR-body volgende sprint). Geen user-pauze. Geldt voor ALLE sprints tot 100% klaar.

### Fix-until-correct (user-quote 2026-05-13)

> *"Zo niet, dan herstel je dit tot wanneer deze stap volledig in orde is en gecontroleerd via de extensietool."*

Bij faal van verificatie:
- ❌ Niet doorgaan naar volgende sprint
- ✅ Direct herstellen via follow-up PR
- ✅ Opnieuw verifiëren tot ✅ OK
- Pas dan ✅ DONE markeren + door naar volgende sprint

**Voorbeeld**: Sprint 1 rollen.html toonde "0 rollen" door render-timing bug. Direct gefixt in PR #26, niet uitgesteld. Een sprint is **pas ✅ DONE** als productie-verificatie ✅ is.

## Sprint volgorde (vast)

| # | Sprint | Effort | Status | PR# |
|---|---|---|---|---|
| S1 | Rollen-organogram + profile koppeling | 8-12u | ✅ DONE | #24 (fix #26) |
| S2 | RLS hardening kritieke tabellen (verzuim, clienten, medewerker_documenten, medewerker_notities) | 8u | ✅ DONE | #25 |
| S3 | RLS hardening salaris + uren tabellen | 4u | ✅ DONE | #27 |
| S4 | BS2 deep walk + implementatie: Planning Voorinstellingen-save | 3u | ✅ DONE | #28 |
| S5 | Planning Exporteren CSV | 2u | ✅ DONE | #29 |
| S6 | Planning Financiën — KPI cards "Openstaande uren" + "Gem. tarief" + per-row chips | 4u | ✅ DONE | #30 |
| S7 | HR/Salarisadministratie — Dienst-gebaseerde export | 4u | ✅ DONE | #31 |
| S8 | Taken filters — Teamlid + Deadline + Aanmaakdatum + Reset + "Aangemaakt door" kolom | 3u | ✅ DONE | #32 |
| S9 | Beleid documenten — Reset + Kolommen-kiezer (upload al aanwezig) | 3u | ✅ DONE | #33 |
| **S10** | **BS2 data resync via browser-snippet — user-actie vereist** | 3u + user | 🟡 IN PROGRESS | (volgende PR) |
| S11 | Authenticated E2E tests met test-user | 2u | ⏳ TODO | — |
| S12 | Per-feature regression tests (Betalingen/Contacten/Rapportages/Vragenlijsten) | 4u | ⏳ TODO | — |
| S13 | CI integratie op release-tag | 1u | ⏳ TODO | — |
| S14 | GDPR retention-policy + DSR flow (uit item 40) | 4u | ⏳ TODO | — |
| S15 | Vrije tekst safeguards verzuim (uit item 40) | 2u | ⏳ TODO | — |
| S16 | BS2 deep walk per resterende module — vang nog onontdekte features | 4-8u | ⏳ TODO | — |
| S17 | Entiteiten (alleen als user expliciet vraagt) | 4-6u | ⏸️ OPTIONEEL | — |
| S18 | Final live verification BS1 ↔ BS2 zij-aan-zij door alle modules | 4u | ⏳ TODO | — |
| S19 | v2 release notes + eindrapport-update | 1u | ⏳ TODO | — |

**Totaal**: 55-75u dedicated werk, ~18-19 sprints, evenveel PR's.

---

## Sprint-details

### S1 — Rollen-organogram + profile koppeling (8-12u)

**Doel**: BS1 krijgt zelfde rollen-hierarchie als BS2 (5 niveau's, 15 rollen).

**Sub-tasks**:
1. Migration `org_role_sections` (id, naam, volgorde) + `org_roles` (id, section_id FK, naam, beschrijving, volgorde, gebruikers_count generated)
2. Seed data per BS2 walkthrough op 2026-05-13:
   - Eigenaarschap → Eigenaar
   - Topmanagement → Admin, Directeur
   - Middenmanagement → Planner, Cliëntbeheer, Teamleider
   - Specialisten & Adviseurs → HR, Gedragswetenschapper, Facilitair, Finance, Salarisadministratie
   - Uitvoerend Personeel → Medewerker, Beleid, Medewerker Test
3. UI: nieuwe pagina `rollen.html` in Organisatie-menu (sub-tab naast Teams)
4. UI toont organogram als read-only kaarten gegroepeerd per sectie
5. Migratie: bestaande `profiles.rol` enum (admin/medewerker/viewer) → `profiles.rol_id` FK met seed-mapping
6. Helper functies updaten: `is_admin()` blijft, nieuwe `is_in_role('Naam')`, `current_user_role_id()`
7. Drag-drop voor v3 (NIET nu — read-only is genoeg voor v2)

**Acceptance**:
- Pagina toont organogram zoals BS2
- Counts per rol kloppen
- Bestaande user-rollen blijven werken (geen breakage in auth-guard)

### S2 — RLS hardening kritieke tabellen (8u)

**Doel**: GDPR Art. 9 compliance + cliënt-PII bescherming.

**Tabellen + policies**:
- `verzuim`: SELECT = hr+eigen, INSERT/UPDATE = hr, DELETE = admin
- `medewerker_verzuim_perioden`: idem
- `clienten`: SELECT/UPDATE = begeleider+admin, DELETE = admin
- `medewerker_documenten`: SELECT/UPDATE = eigen+hr, DELETE = admin
- `medewerker_notities`: SELECT/UPDATE = auteur+hr, DELETE = admin

**Helper-functie nodig**: `is_begeleider_van(client_id)` — vereist caseload-mapping. Eerste implementatie: alle medewerkers met `rol IN ('Medewerker', 'Teamleider')` zijn begeleider van alle cliënten (geen FK). v3 kan dat verfijnen.

**Acceptance**:
- Anon-test (Postman of Chrome MCP zonder login): geen toegang
- Test-user met rol `medewerker`: kan eigen verzuim zien, niet andermans
- Test-user met rol `hr` of `admin`: ziet alles

### S3 — RLS hardening salaris + uren (4u)

**Tabellen**:
- `salarisschalen`, `salarishuis_wijzigingen`: hr+admin only
- `urendeclaraties`: eigen + manager + admin
- `comp_saldi`, `uren_budget`: eigen + manager + admin
- `saladmin_*` tabellen: hr+admin only

### S4 — Planning Voorinstellingen-save (3u)

**Wat**: huidige filter-set kunnen opslaan + later herstellen.

**Sub-tasks**:
1. Migration `planning_voorinstellingen` (id, naam, filter_json, user_id, created_at)
2. UI: "Opslaan als voorinstelling" knop in planning.html toolbar
3. UI: dropdown "Mijn voorinstellingen" om snel te laden
4. JS: serialiseer huidige filter-state als JSON

### S5 — Planning Exporteren CSV (2u)

**Wat**: download van zichtbare shifts als CSV.

**Sub-tasks**:
1. JS-functie die `dataState.shifts` filtert op huidige view + maakt CSV-string
2. UI: knop in planning.html (al aanwezig in BS2)
3. Download via `<a href="data:text/csv;...">` of Blob

### S6 — Planning Financiën sub-page (4u, na BS2 deep walk)

**Eerst**: bezoek `/planning/finances` (vermoedde URL) of via Financiën-knop in BS2, capture structuur.
**Dan**: implementeer in BS1 als nieuwe pagina of sub-tab.

### S7 — HR/Salarisadministratie (4u, na BS2 walk)

Bezoek `/hr/monthly-payroll` in BS2, vergelijk met BS1 `salarisadministratie-exporter.html`. Bouw uit indien nodig.

### S8 — Taken (3u)

Bezoek `/tasks/list`. Vergelijk met `taken.html`. Bouw filters/statussen indien nodig.

### S9 — Beleid (3u)

Bezoek `/documents`. Vergelijk met `beleid.html` + storage bucket. Implementeer document-upload indien nodig.

### S10 — BS2 data resync (3u + user-actie)

**Wat**: JS-snippet in BS2 console → JSON met sessie-cookies → import in BS1.

**Sub-tasks**:
1. Write `scripts/bs2-browser-snippet.js` met fetch-loop voor alle endpoints
2. Document hoe user runt (in BS2 console paste + auto-download)
3. Update `bs2-full-import.mjs` om `bs2_id` te bewaren in `data` jsonb
4. Update `bs2-fix-client-id.mjs` om de bewaarde `bs2_id` te gebruiken
5. User runs → counts gelijk maken aan BS2

### S11-S13 — E2E testing uitbouw (7u)

Authenticated tests, per-feature regression, CI integratie. Per item 41 voorgestelde uitbreidingen.

### S14-S15 — GDPR vervolg (6u)

Retention policy via pg_cron + DSR pagina `/mijn-gegevens`. Vrije tekst safeguards in verzuim-notitie veld.

### S16 — Resterende module deep walks (4-8u)

Voor elke nog-niet-gewalked sub-feature: capture in BS2 + implementeer in BS1. Iteratief, per submodule mini-PR.

### S17 — Entiteiten (OPTIONEEL)

Skip tenzij user expliciet wenst (BS2 heeft 0 records).

### S18 — Final live verification (4u)

Open BS1 ↔ BS2 zij-aan-zij in Chrome MCP voor elke top-page. Vergelijk tabellen, knoppen, modals, filters. Documenteer eventuele rest-gaps in nieuw item.

### S19 — v2 release notes (1u)

Update `99-v1-eindrapport.md` → `99-v2-eindrapport.md` met:
- Alle voltooide sprints
- Eindstand BS1 ↔ BS2 vergelijk
- Wat nog open is voor v3

---

## Workflow per sprint

```
1. git switch -c feature/sprint-N-<slug> origin/main
2. Implementeer + commit per logische sub-step
3. git push -u origin feature/sprint-N-<slug>
4. gh pr create
5. Aan user: "Klik om te mergen: <URL>"
6. Wacht op merge-bevestiging
7. Status in dit document: ⏳ TODO → ✅ DONE + PR#
8. Update dit document via aparte korte commit als nodig
9. Begin volgende sprint
```

## Wat MOET veranderen in mijn workflow

**Stop doen**:
- "Welke wil je als volgende?" — sprints zijn vast in volgorde
- "Mag ik dit doen?" — sprints zijn al goedgekeurd door dit master-plan-document
- Lange uitleg per sprint — kort houden, focus op uitvoering

**Blijven doen**:
- Korte status na elke commit
- Heldere merge-link
- Open-items file per sprint voor history-track
- Anti-conflict regel: nieuwe items 29+ in `docs/phase4/open-items/<NN>-<slug>.md`

## Wat ETF-admin nog moet doen (parallel, geen blokkade)

Drie acties vóór externe productie of regulatorische audit:

| # | Actie | Effort | Trigger |
|---|---|---|---|
| A1 | Supabase DPA tekenen via dashboard | 5 min | Vóór externe gebruik |
| A2 | Vercel DPA tekenen via dashboard | 5 min | Vóór externe gebruik |
| A3 | Eerste pg_dump backup-test | 5 min | Binnen 1 maand vanaf 2026-05-13 |

Claude herinnert hieraan aan begin van elke sessie als ze nog niet gedaan zijn.

## Status-tracking voor Claude

Bij elke sprint-completion update Claude dit document:
- Sprint-tabel: status → ✅ DONE + PR#
- En memory file `project_besa_v2_parity.md` met dezelfde status

Bij sessie-start leest Claude beide en weet exact waar te beginnen.
