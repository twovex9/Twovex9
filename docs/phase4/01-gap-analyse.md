# Phase 4 — 01: Gap-analyse na BS2 → BS1 data-port

**Datum**: 2026-05-12
**Status**: 4A1 voltooid (BS1 live test 7 hoofdpagina's). 4A2 BS2 deep-dive komt later in 4D wanneer specifieke features bouwen.

## Methodiek

Per BS1-pagina geopend op `futureflow-app.vercel.app`, screenshot + DOM-read via Chrome MCP. Vergeleken met verwachte data (records counts uit Supabase).

## Bevindingen per pagina

### 1. `/index.html` — Medewerkers

✅ **Werkt**: 197 records zichtbaar in tabel (Supabase: 198, 1 verschil — onderzoek of een gefilterd is)

⚠️ **Issues**:
- **Dubbele records**: BS1-originele + BS2-geïmporteerde medewerker met zelfde naam (bv. Samra Akaazoun, Sofyan Amenchar, Achraf akhicha) hebben verschillende UUIDs en email-casing → 2 rijen
- **Dienstverband-mismatch**: BS2 records tonen raw waarden (`hiring`, `permanent`, `intern`) terwijl BS1 normaal toont (`Inhuur`, `Loondienst`, `Stagiair`)
- **Lege kolommen voor BS2-records**: locatie, bureau, contracttype, functie, opleiding, werktype, startdatum, periodieke maand, einde contract, uit dienst staan allemaal "—"
- **Verjaardag mismatch**: BS1 records hebben verjaardag, BS2 sommige wel sommige niet (mapping van date_of_birth in data jsonb maar niet in geboortedatum kolom)

**Prioriteit**: KRITIEK (dubbele records moet weg)

### 2. `/clienten.html` — Cliënten

✅ **Werkt**: 161 records zichtbaar (BS1 80 + BS2 81)

⚠️ **Issues**:
- **Dubbele cliënten**: BS1 + BS2 versie met zelfde naam (Raymond Ader, Roma Baltus, Haifaa Alnakshbandi, etc.)
- **Cliëntnummer ontbreekt voor BS2-records**: door bewust NULL gezet (in `data.bs2_client_number`) om `clienten_clientnummer_unique_active` constraint te omzeilen
- **Fase/gemeente mapping fout**: bv. "Salvator Albano — In zorg Leeuwarden": "Leeuwarden" verschijnt in fase-kolom of gemeente-kolom op verkeerde plek; "WLZ" toont als gemeente terwijl dat een zorgsoort/financieringsbron is
- **Organisatie meestal "—"**: niet alle BS2 cliënten hadden organization gemapt
- **Required forms kolom**: leeg voor BS2-records

**Prioriteit**: KRITIEK (mapping bug; dubbele cliënten)

### 3. `/beschikkingen.html` — Beschikkingen

❌ **KRITIEK — toont "0 van 0"** terwijl Supabase 251 records heeft!

⚠️ **Issues**:
- **Default-filters blokkeren alles**: filters "Verloopt binnen 60d" / "Heeft te declareren lopende maand" / "Heeft nog niet gedeclareerd" zijn possible default actief; geport BS2-data triggert geen van deze condities omdat `nog_niet_gedeclareerd=0` standaard
- **Zorgsoort-dropdown bevat duplicaten**: "Ambulant intern" 3×, "Fase wonen" 2×, "Gecombineerd" 2× — komen van DISTINCT zorgsoort_key VARIANTEN ("Ambulant intern" vs "Ambulant Intern" of " Ambulant intern" met spatie)
- **VLZ vs WLZ**: een unbekende variant in dropdown

**Prioriteit**: KRITIEK (geen beschikkingen zichtbaar)

### 4. `/facturen.html` — Facturen

✅ **Werkt**: 990 records zichtbaar (BS1 956 + BS2 34)

⚠️ **Issues**:
- **Status-mismatch**: BS2-records tonen status `submitted` / `approved` (Engels raw), BS1-norm is `Gedeclareerd en in behandeling` / `Betaald` / `Te declareren` / `Nog niet betaald`
- **Periode/betaald/cliëntnummer leeg** voor BS2 (mapper mapped niet correct)
- **Cliënt-kolom**: BS2-records tonen organisatie-naam (HAE-CARE, Yas Multiworks, AB-Care) i.p.v. cliënt-naam
- **Beschikking-label**: "Factuur 2026040010" — placeholder, niet echte beschikking-naam

**Prioriteit**: BELANGRIJK (data zichtbaar maar verkeerd)

### 5. `/planning.html` — Planning

❌ **KRITIEK — 0 diensten zichtbaar** ondanks 4461 records!

⚠️ **Issues**:
- **Default-view = huidige week (Week 20 Mei 2026)**: BS2 import bevat vooral oude shifts (2020-2025), geen huidige
- **Bureaus-dropdown**: 5 records (BS1) — BS2's 4 BS-namen niet gemerged
- **Locaties-dropdown**: bevat duplicaten (BS1 + BS2 locaties met zelfde naam, verschillende UUIDs)
- **Teamlid-dropdown**: 100 medewerkers (BS2 namen) — werkt visueel maar mogelijk dupes door inclusie van BS1 medewerkers met zelfde naam

**Prioriteit**: KRITIEK (lege weergave wegens default-view)

### 6. `/incidenten.html` — Incidenten

✅ **Werkt grotendeels**: 144 records zichtbaar, status pills werken, datums goed geformatteerd

⚠️ **Issues**:
- **Cliënt-kolom leeg**: "—" voor alle 144 records — `client_id` FK is geport maar BS1 wijst niet naar de juiste cliënt (mogelijk BS2 client_id is geen BS1 client_id)
- **Gemeld door leeg**: melder_id niet ge-resolved
- **Dropdowns dupliceren**: 
  - Categorieën: elke 2×
  - Locaties: elke 2-3× (BS1 + BS2 UUIDs)
  - Cliënten: bv. "Raymond Ader" en "Raymond Ader (184)" — clientnummer toont alleen voor BS1
- **"Test Medewerker" en "Test Client"** in dropdowns: BS2 test-records die ook geport zijn

**Prioriteit**: BELANGRIJK (data zichtbaar, FK's ontbreken)

### 7. `/home.html` — Home

✅ **Werkt**: nieuws-feed toont 15 BS1-items correct

❓ **Niet getest**: notification-bell counter, welkom-bericht (geen voornaam dus toont "Welkom" + nudge)

**Prioriteit**: LAAG (geen data-port issues)

## Cross-cutting issues

### A. Master-data UUID-overlap

BS1 master-data (gemeenten, zorgsoorten, locaties, bureaus, competenties, opleidingen) heeft eigen UUIDs. BS2 master-data heeft andere UUIDs maar zelfde namen. Resultaat: in dropdowns verschijnen duplicaten omdat BS1-records refereren naar BS1-UUIDs en BS2-records naar BS2-UUIDs.

**Fix-opties**:
1. **UPDATE BS2-records** om hun FK te wijzigen naar BS1 UUID via naam-match (preferred)
2. Schrappen BS2 master-data records (geen FK-changes nodig)
3. Mapping-tabel `bs2_uuid_to_bs1_uuid`

### B. Status/fase/dienstverband-mapping

BS2 stuurt Engelse raw waarden: `hiring`, `permanent`, `intern`, `submitted`, `approved`, `Actief`. BS1 verwacht Nederlandse genormaliseerde: `Inhuur`, `Loondienst`, `Stagiair`, `Gedeclareerd en in behandeling`, `Betaald`, `actief`.

**Fix**: UPDATE Supabase records met SQL mapping. Geen schema-changes nodig.

### C. FK-resolves

| Tabel | Veld | BS2-data | Status |
|---|---|---|---|
| `incidenten` | `client_id` | UUID's uit BS2 | NIET in BS1.clienten — naam-match nodig |
| `incidenten` | `melder_id` (medewerker UUID) | n.v.t. (BS2 stuurt geen) | optioneel: skip |
| `verzuim` | (heeft alleen `medewerker` string) | n.v.t. | optioneel: FK kolom toevoegen |
| `beschikkingen` | `client_id` | UUID's uit BS2 | NIET in BS1.clienten — naam-match nodig |
| `facturen` | `client_id` | UUID's uit BS2 | NIET in BS1.clienten — naam-match nodig |
| `planning` | n.v.t. (alleen string fields) | n.v.t. | optioneel |

### D. Dubbele records

BS1 had pre-existing data (test-records of vroege port). BS2-port voegt records toe met andere UUIDs. Resultaat:
- medewerkers: ~98 dupes
- clienten: ~80 dupes

**Fix-opties**:
1. **MERGE strategie**: behoud BS1 record, dump BS2-specifieke data in BS1's `data jsonb`, verwijder BS2 record
2. **Verwijder BS1 origineel** (test-data is meestal Engels of dummy)
3. **Verwijder BS2 import** (BS1 was al goed)

Per resource keuze maken in Fase 4E met user-confirm.

### E. BS2 dispositions "lower(zorgsoort_key)" duplicaten in dropdown

Zorgsoort dropdown toont "Ambulant intern" 3×. Mogelijk:
- "Ambulant intern" (BS2)
- "Ambulant Intern" (capitalize variant)
- " Ambulant intern" (met spatie)

Te fixen via UPDATE: `LOWER(TRIM(zorgsoort_key))` als canonieke variant.

## Prioriteits-lijst voor Fase 4B-4D

### KRITIEK (Fase 4B)

1. **FK-resolve via naam-match**: `incidenten.client_id`, `beschikkingen.client_id`, `facturen.client_id` → match op cliëntnaam → BS1 cliënt UUID
2. **Dienstverband/status/fase normalisatie**: BS2 raw waarden → BS1 NL waarden via UPDATE-queries
3. **Beschikkingen default-filter fix**: aanpassen zodat data zichtbaar is bij default-load
4. **Planning default-view**: optie om "alle weken" te tonen of betere date-range

### BELANGRIJK (Fase 4C)

5. **Dropdown-dedup**: master-data UUID-mapping (BS2 records koppelen aan BS1 master-data UUIDs)
6. **Cliëntnummer-fallback voor BS2 records**: toon `data.bs2_client_number` als fallback in UI
7. **Facturen client_label**: gebruik echte cliënt-naam i.p.v. organisatie

### KAN LATER (Fase 4E)

8. **Dubbele records merge/cleanup** (medewerkers, clienten) — vereist user-confirm
9. **Test-records identificeren en verwijderen** (Test Client, Test Medewerker, Emma Smit, etc.)

## Volgende stap

Fase 4B beginnen — FK-resolves via SQL. Werkt via Supabase MCP zonder safety-block (UPDATE-statements op bestaande records, geen mass-PII-insert).

Plus: alle dropdowns met UUID-mapping fixen door BS2 records te updaten met BS1 UUIDs via naam-match.

Schema-prep:
1. SELECT BS2 records uit clienten met BS2 UUID (data.bs2_id niet null OR id is uuid-pattern)
2. SELECT alle clienten met (voornaam, achternaam) match
3. UPDATE BS2 records om hun FK naar BS1-UUID te zetten

Of: omgekeerd: voor incidenten/beschikkingen/facturen die client_id verwijzen, lookup en update naar BS1 cliënt-UUID.

Pragmatisch: ik begin met SQL-queries en commit per resource.
