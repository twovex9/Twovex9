# BS2 → BS1 full data import

Volledige port van alle 15 BS2 resources (5497 records) naar BS1 Supabase.
**Jij runt dit zelf** op je eigen machine — geen Claude tussen.

## Wat doet het script

- Leest `scripts/bs2-exports/bs2-export-full.json` (15.5MB, alle BS2 data)
- Mapt elk BS2-record naar het juiste BS1-schema (incl. data jsonb voor extra BS2-velden)
- Insert via Supabase REST API met **service_role key** (bypasst RLS)
- Upsert (idempotent: meerdere keren runnen is veilig)
- Batches van 50 per keer
- FK-dependency volgorde (master-data eerst, dan PII)

## Stap 1 — Haal je Supabase service_role key

1. Open: <https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api>
2. Scroll naar **"Project API keys"**
3. Naast **`service_role`** → klik **"Reveal"** (oogje)
4. **Kopieer** de hele lange JWT-token (`eyJ...`)

> ⚠️ **Niet committen / niet delen.** Deze key bypasst RLS. Wie 'm heeft kan alles in jouw DB.

## Stap 2 — Set env var + run

**PowerShell (Windows):**

```powershell
cd "C:\Users\sonck\OneDrive\Desktop\ETF\besa suite git clone\besa-suite-etf"
$env:SUPABASE_SERVICE_KEY = "PLAK_HIER_DE_SERVICE_KEY"
node scripts/bs2-full-import.mjs
```

**Bash (Linux/Mac/WSL):**

```bash
cd "/c/Users/sonck/OneDrive/Desktop/ETF/besa suite git clone/besa-suite-etf"
export SUPABASE_SERVICE_KEY="PLAK_HIER_DE_SERVICE_KEY"
node scripts/bs2-full-import.mjs
```

## Stap 3 — Wacht ~2-5 minuten

Je ziet voortgang per resource:
```
[gemeenten] 316 records -> public.gemeenten
  inserted: 316, skipped: 0, errors: 0
[clienten] 87 records -> public.clienten
  inserted: 87, skipped: 0, errors: 0
[planning] 4454 records -> public.planning
  inserted: 4454, skipped: 0, errors: 0
...

=== Summary ===
┌─────────┬──────────────────────┬───────────────────────┬──────────┬──────────┬────────┐
│ (index) │ resource             │ table                 │ inserted │ skipped  │ errors │
├─────────┼──────────────────────┼───────────────────────┼──────────┼──────────┼────────┤
...
```

## Flags

| Flag | Wat het doet |
|---|---|
| `--dry-run` | Toon alleen wat er gebeurt, geen inserts |
| `--only <naam>` | Alleen één resource (bv. `--only clienten`) |
| `--verbose` | Toon eerste 3 errors per resource bij failures |

Voorbeelden:

```powershell
# Test eerst met dry-run om te zien wat er zou gebeuren:
node scripts/bs2-full-import.mjs --dry-run

# Alleen cliënten:
node scripts/bs2-full-import.mjs --only clienten

# Met error-details:
node scripts/bs2-full-import.mjs --verbose
```

## Wat als er errors zijn?

- **Check constraint violations** (bv. zorgsoorten.tarieftype): mapping is mogelijk anders. Sturen me een `--verbose` output en ik pas mappers aan.
- **HTTP 401**: service_role key fout/expired. Haal opnieuw uit dashboard.
- **HTTP 409 conflict**: Idempotent upsert zou dit moeten afhandelen — als het toch optreedt is er een tweede unique-constraint waar `Prefer: resolution=merge-duplicates` niet op draait. Stuur me de error.
- **HTTP 400 bad request**: kolom-namen mismatch. Toon de error en ik fix de mapper.

## Volgorde (FK-dependency)

1. **Master-data** (geen FKs):
   - gemeenten (316), zorgsoorten (6), bureaus (4), competenties (1)
   - opleidingen (69), locaties (11), organisaties (96)
   - salarisschalen (15), incident_categorieen (13)
2. **Medewerkers** (100) — verrijkt `data jsonb` op bestaande records via email-match (al 95/98 gedaan in vorige sessie)
3. **Cliënten** (87)
4. **Beschikkingen** (151) — FK naar cliënten
5. **Incidenten** (144) — FK naar cliënten
6. **Facturen** (34) — FK naar cliënten + medewerkers (via labels)
7. **Planning** (4454) — grootste

## Verzuim (medische data) — apart

Voor verzuim (9 records inclusief verzuim van medewerkers) is `scripts/bs2-exports/verzuim-manual-insert.sql` apart klaargezet. Run die in **Supabase Studio SQL Editor**: <https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/sql/new>

## Na succesvolle import

Verifieer in Supabase Studio:

```sql
SELECT
  (SELECT COUNT(*) FROM public.medewerkers) AS medewerkers,
  (SELECT COUNT(*) FROM public.clienten) AS clienten,
  (SELECT COUNT(*) FROM public.beschikkingen) AS beschikkingen,
  (SELECT COUNT(*) FROM public.facturen) AS facturen,
  (SELECT COUNT(*) FROM public.planning) AS planning,
  (SELECT COUNT(*) FROM public.incidenten) AS incidenten,
  (SELECT COUNT(*) FROM public.gemeenten) AS gemeenten,
  (SELECT COUNT(*) FROM public.organisaties) AS organisaties;
```

Verwachte minima na port:
- medewerkers ≥ 100
- clienten ≥ 87
- beschikkingen ≥ 151
- facturen ≥ 34
- planning ≥ 4454
- incidenten ≥ 144
- gemeenten ≥ 316
- organisaties ≥ 96

## Veiligheid

- ✅ Service_role key staat alleen in jouw shell env var, niet in code/repo
- ✅ JSON-bestand met PII zit in `.gitignore` (komt niet op GitHub)
- ✅ Upsert is idempotent — meerdere keren runnen overschrijft niets onverwacht
- ✅ Bestaande BS1 records die niet in BS2 staan blijven onaangetast
