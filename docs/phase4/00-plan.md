# Phase 4 — Volledige BS2 → BS1 parity finalization

**Status**: ACTIEF
**Start**: 2026-05-12
**Doel**: Future Flow 1 is 100% functioneel equivalent van BS2 — data + UI + features. Elke functie werkt, elke pagina rendert correct, geen gaps.

## Achtergrond (waar we vandaan komen)

- **Phase 1**: BS2 globale inventaris (docs/bs2-inventaris.md)
- **Phase 2**: 6 nieuwe modules + 4 follow-up features (notification-bell, audit modal, home polish, profile notification prefs M2M) — alle gecommit
- **Phase 3**: 5092 records BS2 → BS1 geport via service_role Node-script (5083 via tool + 9 verzuim manual) — alle non-master-data records inserted, master-data al superset in BS1

## Wat is NOG nodig (Phase 4 scope)

1. **Data is geport maar mogelijk niet correct gekoppeld**: FK's (medewerker_id, client_id, locatie_id) ontbreken in veel records; namen staan als strings
2. **UI rendert mogelijk niet alles correct** met grotere/echte dataset: datum-formaten, fase-pills, status-strings, pagination
3. **BS2-pagina's nog niet DOM-geïnspecteerd**: cliënten-detail, beschikking-detail, factuur-flow, planning-kalender, kilometers, salarisadmin, urendeclaraties, incident-detail, modals
4. **Mogelijk ontbrekende features** uit BS2 in BS1: workflow-stappen, document-uploads, comments, advanced filters

## Het 6-fase plan (LEIDEND — niet afwijken)

### Fase 4A — Inventaris & gap-analyse (1.5-2 uur autonoom)

#### 4A1. BS1 live test
- Per BS1-pagina (alle 35): Chrome MCP open, screenshot, check renders met geporte data
- Noteer per pagina: rendert-OK / rendert-buggy / crash / missing-data-display
- Vergelijk records-counts UI vs Supabase

#### 4A2. BS2 deep-dive
- Pagina's nog niet geïnspecteerd:
  - `/clients/<id>` cliënt-detail
  - `/dispositions/<id>` beschikking-detail
  - `/invoices/<id>` factuur-detail
  - `/shifts` planning-kalender + planning-list
  - `/incidents/<id>` incident-detail
  - `/mileage` of kilometer-declaraties
  - `/salary-administration`
  - `/time-registration` of urendeclaraties
  - Alle modals voor toevoegen/edit per resource
- Per pagina: screenshot + get_page_text + find interactive elements
- Documenteer features: knoppen, filters, kolommen, modal-velden, workflow-stappen

#### 4A3. Output
- `docs/phase4/01-gap-analyse.md` met:
  - **Werkt-niet-lijst**: bugs met de geporte data
  - **Ontbrekende features**: BS2 heeft, BS1 niet
  - **Render-issues per pagina**: visuele problemen
  - **Prioriteit per item**: kritiek / belangrijk / nice-to-have

### Fase 4B — Data cleanup & FK-resolves (1 uur autonoom)

#### 4B1. medewerker_id FK koppelen
- Update `verzuim.medewerker_id` via JOIN op `LOWER(medewerker) = LOWER(medewerkers.voornaam || ' ' || achternaam)` waar mogelijk
- Idem voor `beschikkingen` (geen direct FK kolom, maar via data jsonb of nieuwe kolom)
- Idem voor `facturen` via bs2_employee in data jsonb
- Idem voor `planning` via teamlid string match
- Idem voor `incidenten` via bs2_full.reporter etc.

#### 4B2. client_id verifiëren in beschikkingen
- BS2 stuurde client_id strings. Check welke daadwerkelijk in BS1.clienten bestaan
- Voor missing: probeer naam-match
- Voor unmatchable: log in data jsonb

#### 4B3. Status/fase normalisatie
- BS2 sends 'Actief' → BS1 'actief' overal
- BS2 'submitted' → BS1 facturen-status convention
- Etc.

#### 4B4. Master-data UUID-mapping (optioneel)
- Voor gemeenten/zorgsoorten/locaties/bureaus/opleidingen: BS2 UUIDs ≠ BS1 UUIDs
- Voor cross-references is mapping nodig
- Optie: aparte `bs2_uuid_map` tabel OF `data jsonb` met `bs2_id`

#### 4B5. Dedupe-records onderzoek
- 6 dedupes in clienten (87→81), 6 in planning (4454→4448)
- Was het echte duplicates of paginatie-overlap?

### Fase 4C — UI bugs fixen (2-3 uur autonoom)

Op basis van gap-analyse (4A3):
- Per pagina: rendering fixen
- Filters laten werken met 4461 planning records + 251 beschikkingen + 144 incidenten
- Pagination correct laten paginen
- Detail-pagina's tonen related entities correct
- Fase-pills mapping voor alle BS2-fases
- Datum-formaten consistent

### Fase 4D — Ontbrekende features bouwen (variabel, autonoom)

Per item uit gap-analyse 4A3 "Ontbrekende features":
- Schema-uitbreiding indien nodig (migration)
- Data-laag toevoegen of uitbreiden
- HTML + JS bouwen volgens huisstijl
- Commit per feature

### Fase 4E — End-to-end test + test-data cleanup (1 uur met user-confirm)

#### 4E1. E2E test per pagina
- Create/Read/Update/Delete cyclus
- Filters/search/sort
- Modal-flows
- Cross-page navigation

#### 4E2. Test-data identificeren
- Oude BS1 test-records (Emma Smit, Daan Visser, Marieke Jansen, etc.)
- Bewuste duplicaten

#### 4E3. Cleanup
- **GEEN automatische delete** — per resource user-confirm vragen
- Patroon: "Ik vond X test-records (lijst), wil je dat ik die verwijder? Ja/Nee"

### Fase 4F — Eindrapport + commit + memory-update

- `docs/phase4/99-final-success.md`
- Update `project_ff_phase4.md` memory naar "VOLTOOID"
- Update `CLAUDE.md` Phase 4 sectie naar "voltooid"
- Final push

## Persistente regels (gelden voor ALLE Phase 4 werk)

1. **Geen destructieve actie zonder user-confirm**: DELETE/DROP/TRUNCATE blijft achter expliciete Y/N van user
2. **Idempotent waar mogelijk**: scripts mogen meerdere keren runnen zonder duplicates
3. **Commit + push per logisch afgeronde wijziging** (volgens werkpatronen sec.7)
4. **Bij elke fase-overgang**: rapport + memory-update + commit
5. **Bij blokkade door safety-policy**: STOP, vertel user concreet wat nodig is om op te lossen
6. **Niet afwijken van deze 6 fases**: volg ze in volgorde, geen ad-hoc nieuw werk tussendoor
7. **Bij twijfel of een fase klaar is**: liever vragen dan halfaf doorgaan
8. **Memory + plan-file ALTIJD synchroon** met huidige fase

## Blokkades & escalatie-pad

| Blokkade | Eerste poging | Escalatie naar user |
|---|---|---|
| Bulk-PII Claude tools geblokkeerd | Gebruik bestaande JSON + Node-script (4B FK-resolves) | "Run `node scripts/...` in PowerShell" |
| Chrome MCP PII-page geblokkeerd | Read_page op publieke pages eerst | "Stuur me een screenshot van pagina X" |
| Onbekende BS2-route | Probeer alternative paths | "Klik in BS2 op X en deel de URL" |
| Supabase DROP/DELETE | Vraag confirm | "Mag ik X verwijderen?" |
| Service_role key voor scripts | Gebruik user's env-var | "Run script met SUPABASE_SERVICE_KEY env" |

## Commit-historie referenties

Phase 1 docs/bs2-inventaris.md
Phase 2 commits: 5fa3a51 ... 81490e5
Phase 3 commits: a6b0bdd, 6cda199, 84e5b79, ea10da7, 0a15cbc, 2e158ed, 71951c9, 9ceb6bf, 9aa8250, 824176f, a120a46, baa24ed, eb22f2b

Phase 4 commits: <wordt aangevuld>

## Definitie van "klaar"

Phase 4 is voltooid als:
- ✅ Elke BS1-pagina rendert zonder errors met de geporte data
- ✅ Elke BS2-functie heeft een werkende BS1-equivalent
- ✅ FK-resolves zijn gedaan waar zinvol
- ✅ Test-records zijn opgeruimd (met user-confirm)
- ✅ E2E test per pagina geslaagd
- ✅ Eindrapport gecommit
- ✅ Memory + CLAUDE.md updated naar "voltooid"

Bij twijfel: liever doorlopen via 4F en aanvullingen plannen voor Phase 5.
