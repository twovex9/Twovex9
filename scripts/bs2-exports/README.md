# BS2-exports werkmap

Hierin plaats je handmatige CSV-exports uit BS2 voor Phase 3 PII-data port.

## Waarom deze workflow

PII-data uit BS2 (cliënten, beschikkingen, facturen, planning, verzuim, incidenten) kan vermoedelijk niet automatisch worden geport via injected fetch-interceptor — het safety-systeem classificeert dat als "bulk-PII exfiltration" (zie `docs/phase3/03-blokkades-en-alternatieven.md`). Een handmatige CSV-export via BS2's eigen UI is de juiste route.

## Procedure per resource

1. Open de relevante BS2-pagina in Chrome:
   - Cliënten: `https://etf.acceptance.besasuite.nl/clients`
   - Beschikkingen: `https://etf.acceptance.besasuite.nl/dispositions`
   - Facturen: `https://etf.acceptance.besasuite.nl/invoices`
   - Planning: `https://etf.acceptance.besasuite.nl/shifts`
   - Verzuim: `https://etf.acceptance.besasuite.nl/sickness`
   - Incidenten: `https://etf.acceptance.besasuite.nl/incidents`
2. Klik op de "Exporteer" knop (meestal rechtsboven, soms in "Kolommen" dropdown)
3. Kies CSV of Excel (CSV heeft voorkeur)
4. Sla het bestand op in deze folder met de naam:
   - `clienten.csv`
   - `beschikkingen.csv`
   - `facturen.csv`
   - `planning.csv`
   - `verzuim.csv`
   - `incidenten.csv`
5. Plaats een bericht in chat: *"exports staan klaar"* of *"verzuim.csv staat klaar"*

## Wat Claude doet daarna

1. Leest de CSV via `Read`-tool
2. Maakt een mapping-doc: BS2-kolom → BS1-kolom (rest → `data` jsonb)
3. Schrijft INSERT-statements (text PK: gebruik BS2-id direct; uuid PK: gen_random_uuid() + bewaar BS2-id in `data.bs2_id`)
4. Executeert via `mcp__supabase__execute_sql` in batches van 20-50 rows
5. Verifieert via SELECT count + spot-check
6. Commit doc + push naar main

## FK-resolve via medewerkers.data.bs2_id

Voor relaties naar medewerkers: alle 95 BS1-medewerkers hebben hun BS2-UUID in `data.bs2_id`. Een factuur die in BS2 `medewerker_id = 'b87c33a8-...'` heeft, mapt naar BS1 via:

```sql
INSERT INTO public.facturen (..., medewerker_id)
SELECT ..., m.id
FROM public.medewerkers m
WHERE m.data->>'bs2_id' = 'b87c33a8-...';
```

## Niet committen!

Deze folder staat NIET in `.gitignore` (per ongeluk), maar **CSV-bestanden met PII zijn productiedata en mogen niet naar GitHub**. Voor je commit:

```bash
git status                     # controleer wat je gaat committen
git restore --staged scripts/bs2-exports/*.csv   # un-stage alle CSVs
```

Of voeg toe aan `.gitignore`:
```
scripts/bs2-exports/*.csv
scripts/bs2-exports/*.xlsx
```

Alleen deze README mag in de repo blijven staan.
