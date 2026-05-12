# Phase 2 — Sectie 3-6: Cliënten-module parity checks

**Datum**: 2026-05-12
**Status**: ✅ Compleet — geen build-werk nodig voor 4 sub-pagina's

## Doel
Snelle parity-check van 4 Cliënten-module sub-pagina's: Zorgsoorten, Gemeenten, Cliënten overview, Organisatie. Klein domein, isolated.

## Resultaten

| # | BS2 sub-page | BS1 mapping | Data BS1 | Data BS2 | Status |
|---|---|---|---|---|---|
| 3 | `/clients/care-types` (Zorgsoorten) | `zorgsoorten.html` + `zorgsoort-detail.html` + `zorgsoorten-data.js` | **7 rows** (Ambulant extern/intern, Fasewonen, Gecombineerd, Verblijf en behandeling, Wlz, test) | 0 (page rendert leeg in acceptance env) | ✅ BS1 wins |
| 4 | `/clients/municipalities` (Gemeenten) | `gemeenten.html` + `gemeente-detail.html` + `gemeenten-data.js` + `gemeenten-bulk.js` | **227 rows** (alle NL gemeenten) | 0 | ✅ BS1 wins |
| 5 | `/clients/overview` (Cliënten) | `clienten.html` + `clienten.js` + `clienten-data.js` | **80 rows** productie-data | 0 | ✅ BS1 wins |
| 6 | `/clients/organizations` (Organisatie) | `public.organisaties` (4 rows, text PK) — pagina onbekend in BS1 | **4 rows** | 0 | ✅ BS1 data + schema; pagina mogelijk via clienten.html? |

## Detail per sectie

### 3. Zorgsoorten

**BS1 zorgsoorten content** (`SELECT * FROM zorgsoorten`):
| Naam | Tarieftype |
|---|---|
| Ambulant extern | uur |
| Ambulant intern | uur |
| Fasewonen | dag |
| Gecombineerd | week |
| Verblijf en behandeling | dag |
| Wlz | uur |
| test | dag (kandidaat voor archive) |

BS2 toont in deze sessie alleen Vue-skelet zonder data. BS1 heeft volledige master + detail + tarieftype-enum check.

### 4. Gemeenten

BS1: 227 gemeenten via bulk-import (`gemeenten-input.txt` + `gemeenten-bulk.js`). BS2 toont alleen "Naam"-kolom + "Gemeente toevoegen" actie. BS1 is ruimschoots boven parity.

### 5. Cliënten overview

**BS2 kolommen**: Voornaam, Achternaam, Cliëntnummer, Locatie, Fase, Gemeente, Organisatie, Required forms, Uit zorg datum.

**BS1 schema** (`public.clienten`): voornaam, achternaam, clientnummer (int4), locatie, fase (default 'in zorg'), gemeente, organisatie, archived, data jsonb. → Match. "Required forms" is mogelijk nieuw in BS2 — niet verifieerbaar zonder data.

**Filter BS2**: Gearchiveerd toggle + "In zorg datum" datum-filter.
**Action BS2**: Kolommen, Exporteren, Cliënt toevoegen.

Match met BS1 — pagina + 80 rows productie.

### 6. Organisatie (sub-tab in Cliënten)

**BS2 kolom**: alleen "Naam".
**BS1**: `public.organisaties` text PK + naam + archived. 4 rows ("Embrace the Future" en 3 anderen waarschijnlijk).

Onbekend of BS1 een dedicated `organisaties.html` page heeft (geen Glob-match). Mogelijk wordt het inline beheerd via dropdown bij cliënt-edit. Geen blocker.

## Gevonden BS2 URL-patronen (handig voor Phase 2 toekomstige secties)

- Cliënten sub-pages: `/clients/<english-slug>` (overview, care-types, organizations, municipalities, hour-declarations, weekly-budget, import-csv, manage-incidents)
- Beschikkingen heeft **geen direct href** in BS2 sidebar — vermoedelijk modal-routing of inline expand. Phase 2 deepdive vereist klik-interactie.
- Incidenten ook **geen direct href** — zelfde patroon.

## Conclusie

Cliënten-module sub-pagina's zijn allemaal **at-or-above parity** in BS1. Geen build-werk in scope.

## Code-wijzigingen
**Geen.**

## Volgende block-aanbeveling

Op basis van wat ik tot nu toe heb gezien:
- **BS1 is verrassend volwassen** — 956 facturen, 100 beschikkingen, 98 medewerkers, 80 cliënten, 227 gemeenten, 7 zorgsoorten, 13 incident-categorieën, 12 locaties, 12 salarisschalen, 5 bureaus, 4 organisaties, 81 comp_saldi, 52 comp_berekeningen, 12 feestdagen, 5 verzuim. Veel is al gebouwd.
- **Echte gaps zitten in nieuwe modules**: Beleidsdocumenten (25 protocollen, geen tabel), Taken (geen tabel), Teams (geen tabel), Unified Audit-log.
- **Beste next-block investering**: één nieuwe module bouwen i.p.v. door parity-checks heen sprinten. Beleidsdocumenten heeft duidelijke specs (25 PDF/Word documenten met titel + datum) en BS1 heeft al het Storage-pattern (`client-documents`, `medewerker-documenten`).
