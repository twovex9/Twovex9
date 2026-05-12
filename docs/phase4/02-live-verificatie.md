# Phase 4 — 02: Live verificatie via Chrome MCP

**Datum**: 2026-05-12
**Methode**: Claude opende elke BS1-pagina zelf via Chrome MCP, las DOM + cache via JavaScript, vergeleek met Supabase counts.

## Status per pagina

| Pagina | Records | Status | Bijzonderheden |
|---|---:|---|---|
| `index.html` (medewerkers) | 103 actief | ✅ | Dedup correct, dienstverband NL, fase `in_dienst` |
| `clienten.html` | 93 actief | ✅ | Cliëntnummers + locaties + gemeenten zichtbaar |
| `beschikkingen.html` | 251 | ✅ | Zorgsoort clean (5 codes), fase NL, 4 statussen |
| `facturen.html` | 990 | ✅ | Status NL (Betaald 224, Gedeclareerd 744, Te declareren 22) |
| `incidenten.html` | 144 | ✅ | 144/144 cliëntnaam + meldernaam + 107/144 locatie |
| `planning.html` | 4461 | ✅ | Na chunked fetch fix (was 1000-limited) |
| `verzuim.html` | 14 (11 lang + 3 kort) | ✅ | BS2 9 + BS1 5 |
| `verlof.html` | 0 | ✅ | Pagina werkt, geen data (geen BS2 verlof export) |
| `audit.html` | 501 in mem | ✅ | Pragmatic limit; SQL counter 2322 |
| `home.html` | nieuws+notifications | ✅ | Welkom + bell counter 2322 |
| `locaties.html` | 10 actief, 13 archived | ✅ | Master-data dedup |
| `gemeenten.html` | 238 actief | ✅ | BS1 227 + 11 BS2 unique |
| `bureaus.html` | 5 actief | ✅ | BS1 superset |
| `opleidingen.html` | 70 actief | ✅ | BS1 69 + 1 BS2 |
| `competenties.html` | 2 actief | ✅ | BS1 al populated |
| `zorgsoorten.html` | 7 actief | ✅ | BS1 superset |

## Bugs gevonden + gefixed tijdens verificatie

### Fix 1: PostgREST 1000-record limit op planning + facturen

**Probleem**: `planning-data.js` fetchAll() haalde max 1000 records op (PostgREST default), terwijl Supabase 4461 planning-records heeft. Facturen had 990 records — net onder limit, maar bij groei risico op truncatie.

**Fix** (`commit fdb2022`):
```js
async function fetchAll() {
  var chunkSize = 1000;
  var all = [];
  var offset = 0;
  while (true) {
    var res = await global.besaSupabase.from(TABLE).select("*")
      .order(...)
      .range(offset, offset + chunkSize - 1);
    if (res.error) throw res.error;
    var batch = res.data || [];
    all = all.concat(batch);
    if (batch.length < chunkSize) break;
    offset += chunkSize;
    if (offset > 50000) break; // safety
  }
  return all.map(rowToObj).filter(Boolean);
}
```

Toegepast op `planning-data.js` + `facturen-data.js`. Andere tabellen (<1000 records) zijn safe op huidige size.

## Minor observaties (niet kritiek)

1. **Status casing in verzuim**: BS1 records hebben `Actief`/`Hersteld` (uppercase), BS2 records `actief` (lowercase). Functioneel werkt, alleen visuele inconsistency.
2. **Browser localStorage cache**: na fixes deploy moet browser cache geforceerd ververst worden (Ctrl+Shift+R). Geen code-fix nodig — bekend gedrag.
3. **Test-data zichtbaar**: "Test Client", "Test Medewerker", locatie "test", bureau "test" — pre-existing BS1 test-records. User beslist of cleanup gewenst.
4. **2 medewerkers met dezelfde naam maar 2 emails**: Leonie Bakx, Fouad Faiz. Niet auto-gemerged (verschillende emails = niet zeker dezelfde persoon).

## Conclusie

**BS1 functioneel + data 100% klaar.** Alle 16 hoofdpagina's open succesvol, tonen geporte BS2-data correct, dropdowns zijn clean (geen duplicaten meer), FK-relaties (incidenten → cliënten + medewerkers) werken.

Resterende items zijn user-discretion (test-data cleanup, paar email-naam-conflicten) of cosmetic (status casing).

## Commits Phase 4 (cumulatief)

- `0b18e27` plan + CLAUDE.md
- `f397d57` 01-gap-analyse
- `e783d0e` bs2-fk-resolve.mjs
- `cbb0215` 99-final-success eindrapport (eerste versie)
- `2564035` persistente werkwijze-regels
- `fdb2022` chunked fetch fix
- `<this>` 02-live-verificatie

Plus Supabase SQL via MCP (master-data dedup, status normalisatie, medewerker/cliënt merge — allemaal idempotent + reverseerbaar via `archived=true`).
