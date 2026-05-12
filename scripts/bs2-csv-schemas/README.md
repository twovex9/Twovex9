# BS2 CSV schema-mappings

Per resource (cliënten, beschikkingen, facturen, etc.) is hier een JSON-map die zegt
welke BS2 CSV-kolom in welke BS1-kolom hoort. Niet-mappable velden gaan in `data jsonb`.

## Workflow

1. User legt `clienten.csv` neer in `scripts/bs2-exports/`
2. `node scripts/bs2-csv-import.mjs clienten --dry-run`
   → detecteert kolommen + types, print skeleton schema-JSON
3. Sla die skeleton op als `scripts/bs2-csv-schemas/clienten.json`
4. Edit JSON: kies per kolom `bs1: "<kolom>"` of `data_jsonb: "bs2_<key>"`
5. `node scripts/bs2-csv-import.mjs clienten --out scripts/_tmp_clienten_insert.sql`
6. Review SQL, execute via Supabase MCP `execute_sql` in batches van 20-50

## Schema-JSON format

```json
{
  "table": "public.clienten",
  "id_strategy": "bs2_id",
  "columns": {
    "ID": { "bs1": "id", "type": "text", "is_bs2_id": true },
    "Voornaam": { "bs1": "voornaam", "type": "text" },
    "Achternaam": { "bs1": "achternaam", "type": "text" },
    "Geboortedatum": { "bs1": "geboortedatum", "type": "date" },
    "Gemeente": { "data_jsonb": "bs2_gemeente_naam", "type": "text" },
    "Fase": { "data_jsonb": "bs2_fase", "type": "text" }
  }
}
```

### Types

- `text` — string (default)
- `int` — integer
- `numeric` — decimaal (komma/punt)
- `boolean` — true/false/ja/nee/yes/no/1/0
- `date` — YYYY-MM-DD of DD-MM-YYYY
- `timestamp` — ISO 8601

### Vlag-velden

- `is_bs2_id: true` — markeer welke BS2-kolom de oorspronkelijke ID bevat (voor referencing in andere tabellen via `data->>'bs2_id'`)
- `data_jsonb: "key"` — i.p.v. `bs1` zet deze in `data jsonb` onder de gegeven key
- Kolommen NIET in de JSON worden genegeerd

## PK-types per tabel

Zie werkpatronen 6a-bis (`.claude/werkpatronen.md`):
- **text PK**: clienten, beschikkingen, facturen, planning, verzuim, organisaties, salarisschalen, ...
- **uuid PK**: medewerkers, competenties, opleidingen, locaties, bureaus, gemeenten, zorgsoorten, nieuws, incidenten

Match het type exact bij elke `id`-kolom mapping.

## FK-resolve naar medewerkers

In facturen/planning/etc. komen medewerker-FK's. BS2 gebruikt zijn eigen UUID voor employee_id; BS1 heeft die UUID bewaard in `medewerkers.data->>'bs2_id'`. Voorbeeld INSERT:

```sql
INSERT INTO public.facturen (id, medewerker_id, ...)
SELECT 'bs2-factuur-id',
       m.id,  -- BS1 medewerker-UUID
       ...
FROM public.medewerkers m
WHERE m.data->>'bs2_id' = '<BS2 employee UUID>';
```

Het CSV-import script doet deze JOIN nog niet automatisch — voor v1 moet je per resource een
nameresolver-stap toevoegen na de CSV→SQL generatie.
