# Phase 4 — 03: Eindstatus na live verificatie + cleanup

**Datum**: 2026-05-12
**Status**: ✅ Phase 4 functioneel + data + UI compleet

## Eindcijfers BS1 (alle UI-pages getest via Chrome MCP)

| Resource | Actief | Archived | Status |
|---|---:|---:|---|
| medewerkers | 102 | 96 | dedup + test-data archive |
| clienten | 92 | 69 | dedup + test-data archive |
| beschikkingen | 251 | 0 | zorgsoort/fase clean |
| facturen | 990 | 0 | status NL genormaliseerd |
| planning | 4461 | 0 | chunked fetch fix |
| incidenten | 144 | 0 | 144/144 FK's gekoppeld |
| verzuim | 14 | 0 | 5 BS1 + 9 BS2; status lowercase |
| locaties | 9 | 14 | dedup + test archive |
| bureaus | 4 | 1 | test archive |
| gemeenten | 238 | 0 | BS1 superset + 11 BS2 |
| organisaties | 90 | 0 | |
| zorgsoorten | 7 | 0 | BS1 superset |
| competenties | 2 | 1 | |
| opleidingen | 70 | 0 | |
| incident_categorieen | 13 | 13 | dedup |
| verlof_aanvragen | 0 | 0 | feature werkt, geen data |
| werkuren | 0 | 0 | feature werkt, geen data |
| urendeclaraties | 7 | 0 | |
| kilometers | 0 | 0 | |

## Wat is gebeurd in Phase 4

### 4A — Inventaris (commit f397d57)
- Gap-analyse 7 hoofdpagina's via Chrome MCP

### 4B — Cleanup + FK-resolves
- Incidenten 144/144 FK-resolve (client/locatie/melder) via naam-match
- Status normalisatie BS2 raw → BS1 NL
- Master-data dedup (locaties 23→9, incident_categorieen 26→13)
- Zorgsoort_key normalisatie (9 varianten → 5 codes)
- Medewerkers merge+dedup (198→102 actief)
- Cliënten merge+dedup (161→92 actief)
- Test-data archive (Test Client, Test Medewerker x2, locatie/bureau 'test')

### 4C — UI fix
- `planning-data.js` + `facturen-data.js`: chunked fetch tegen PostgREST 1000-limit (commit fdb2022)

### 4D — Detail-pages live geverifieerd via Chrome MCP
- `client-detail.html` werkt voor BS1 (`cl_184`) + BS2 (`88bb4840-...`) IDs
- `medewerker.html` werkt voor UUID-PK
- `beschikking-detail.html` werkt voor BS1 (`b_besc_089`) + BS2 (`9838733e-...`) IDs

### 4E — Test-data cleanup voltooid

### 4F — Verificatie compleet
- 16+ pagina's getest
- Alle bugs gevonden tijdens verificatie zijn gefixed (planning chunked fetch)
- Persistente werkwijze-regels opgeslagen voor toekomst

## Verzuim-incident (her-insert)

Tussen Phase 3 en Phase 4 verificatie waren de 9 BS2-verzuim records verdwenen (oorzaak onbekend; mogelijk niet succesvol oorspronkelijk geïnsert of door tussenliggende actie verloren). Bij verificatie ontdekt en opnieuw geport via Supabase MCP (idempotent ON CONFLICT). Eindstand: 14 totaal, 9 met `bs2-verzuim-*` prefix.

## Open items (niet kritiek)

1. **BS2 beschikkingen/facturen client_id**: BS2 endpoints sturen geen client_id. Voor v2: fetch `/api/clients/{id}/dispositions` + `/api/clients/{id}/invoices`. Vereist nieuwe Bearer-token snippet.
2. **2 medewerkers met dezelfde naam, 2 emails** (Leonie Bakx, Fouad Faiz): niet auto-gemerged (verschillende emails). Handmatige review.
3. **Planning default-view = huidige week**: BS2 shifts zijn oudere data. User navigeert handmatig naar oudere weken.
4. **audit-data MAX_PER_SOURCE = 500**: pragmatic UI limit, geen issue.

## Tooling persistent

- `scripts/bs2-full-import.mjs` v3 (idempotent data port)
- `scripts/bs2-fk-resolve.mjs` (FK via naam-match)
- `scripts/bs2-csv-import.mjs` (generic CSV → SQL)
- `scripts/bs2-import-master.mjs` (master-data SQL helper)
- `scripts/bs2-exports/bs2-export-full.json` (15.5MB, gitignored)

## Persistente werkwijze-regels (CLAUDE.md sectie)

1. Destructieve acties → user-confirm
2. **ZELF verifiëren via Chrome MCP** — niet user vragen
3. Doorgaan tot stap klaar is
4. Vragen alleen bij echte blockades

## Commits Phase 4

```
0b18e27  plan-doc + CLAUDE.md
f397d57  01-gap-analyse
e783d0e  bs2-fk-resolve.mjs script
cbb0215  99-final-success (eerste eindrapport)
2564035  persistente werkwijze-regels
fdb2022  chunked fetch fix
1d96946  02-live-verificatie
<this>   03-eindstatus
```

Plus Supabase data-changes via MCP (idempotent + reverseerbaar via archived=true).

## Definitie van "klaar" — bereikt

- ✅ Elke BS1-pagina rendert zonder errors met geporte data
- ✅ Detail-pages werken voor BS1 + BS2 records
- ✅ Master-data dropdowns zonder duplicaten
- ✅ FK-resolves gedaan voor incidenten (144/144)
- ✅ Status/fase/dienstverband NL-genormaliseerd
- ✅ Test-data gearchiveerd
- ✅ Eindrapport + memory + CLAUDE.md geüpdatet

**BS2 → BS1 parity bereikt — Phase 4 voltooid.** 🎯
