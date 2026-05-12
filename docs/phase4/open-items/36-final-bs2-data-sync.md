# Item 36 — Final BS2 → BS1 data sync (POGING 1 FAALDE — zie item 38)

**Datum**: 2026-05-12 (status update na poging)
**Status**: ⚠️ **Eerste poging mislukt 2026-05-12** — Bearer-only fetch werkt niet, BS2 vereist session-cookies. **Zie [item 38](38-bs2-sync-eerste-poging-bevindingen.md) voor nieuwe aanpak (JS-snippet in BS2 console).**

**Originele intentie**: gepland — uit te voeren NA item 14 voltooid (Vragenlijsten-tab). ✅ item 14 gesloten 2026-05-12 → sync poging meteen daarna → gefaald → defer naar v2.
**Gerelateerd**: items 1 (BS2 dispositions/invoices client_id gap), 3 (UUID-mapping), 4 (dedupe-onderzoek), 12 (Bearer-token workflow), Phase 3 + 4 data-port

## Waarom dit gepland en niet nu

User-vraag (2026-05-12, na PR #13): "moeten we de counts gelijk maken aan BS2 voordat we verder gaan met features?"

**Beslissing: LATER, niet nu.** Drie redenen:

1. **Vragenlijsten-tab is nog open** (laatste van item 14's 4 placeholders). Als die nieuwe DB-tabel toevoegt, kunnen de counts daar niet vergeleken worden tot na implementatie. Sync nu = sync straks opnieuw doen.
2. **Data-refresh vereist user-actie** (Bearer-token snippet in BS2 console, ~10 min). User wil maximaal autonoom werken — beter 1× doen aan het eind dan tussendoor.
3. **Sync is idempotent + scripted** — uitstellen kost niets, scripts (`bs2-full-import.mjs`, `bs2-fk-resolve.mjs`) zijn klaar in repo.

## Trigger — WANNEER uitvoeren?

**Direct na merge van Vragenlijsten-tab PR** (= item 14 volledig gesloten). Dan zijn alle BS1-features compleet en kunnen we 1 keer een volledige data-alignment doen.

Optionele extra triggers (parallel of daarna):
- Na RLS-audit item (5.1) — security finalization
- Na e2e test-suite (6.3) — feature-completeness garantie

## Huidige bekende count-verschillen (live gemeten via Chrome MCP 2026-05-12)

| Tabel | BS2 totaal | BS1 actief | Δ | Oorzaak (vermoed) |
|---|---:|---:|---:|---|
| medewerkers | 100 | 102 | +2 BS1 | Recente BS2-verwijderingen of BS1 test-records |
| cliënten | 87 | 92 | +5 BS1 | Dedupe-verschil of nieuwe BS1-records via UI |
| beschikkingen | ~251 | 249 | -2 BS1 | Klein |
| facturen | (niet gemeten) | 990 | ? | Vermoedelijk gelijk |
| planning | (niet gemeten) | 4461 | ? | Vermoedelijk gelijk |

## Stappenplan voor de eindsync

### Voorbereiding

1. **User-actie**: log in op BS2 (`https://etf.acceptance.besasuite.nl`)
2. **User-actie**: open DevTools → Network tab → kopieer Bearer-token uit een willekeurig `/api/*` request
3. **User-actie**: zet token in PowerShell:
   ```powershell
   $env:BS2_BEARER = "PLAK_HIER"
   ```
4. **User-actie**: zet Supabase service_role key:
   ```powershell
   $env:SUPABASE_SERVICE_KEY = "PLAK_HIER"
   ```

### Uitvoering (Claude-acties)

5. **Run snapshot**: nieuwe JSON via `scripts/bs2-fetch-all.mjs` (volg `docs/phase4/05-toolchain-recovery.md` sectie "BS2 → BS1 data refresh workflow", stap 1-3)
6. **Run import**: `node scripts/bs2-full-import.mjs`
   - Idempotent upsert via `ON CONFLICT`
   - Updates bestaande records, voegt nieuwe toe
   - Geen data-verlies (archive in plaats van delete)
7. **Run FK-resolve**: `node scripts/bs2-fk-resolve.mjs`
   - Incidenten cliënt/locatie/melder
   - Master-data UUID via name-match
8. **NIEUW voor deze refresh**: fix item 1 — BS2 dispositions/invoices `client_id`:
   - Voor elke cliënt fetch `/api/clients/{id}/dispositions` + `/api/clients/{id}/invoices` (heeft wel `client_id` in response)
   - UPDATE `beschikkingen.client_id` + `facturen.client_id` waar nog NULL
   - Verwijdert de "—" cliëntnaam in BS1 voor alle BS2-records
9. **Verifieer counts**: query BS1 ↔ BS2 vergelijking via Chrome MCP, documenteer in eind-item

### Cleanup

10. **User-actie**: `$env:BS2_BEARER = $null; $env:SUPABASE_SERVICE_KEY = $null`

## Geschatte effort

- User-actie: ~10 min (Bearer-token + service_role copy)
- Claude-acties: ~15 min (3 scripts + verificatie)
- Totaal: **~25 min**

## Verwachte uitkomst

- BS1 counts = BS2 counts (binnen ±1-2 records, normale UI-mutaties tijdens sync)
- Geen "—" meer bij cliëntnaam voor BS2-imported records (item 1 gesloten)
- 1 follow-up item: master-data UUID-mapping verzamelen (item 3) — `bs2_uuid_map` tabel al bestaat, alleen vullen

## Waar dit terug te vinden

Bij elke nieuwe sessie wordt `04-open-items.md` herlezen, en deze file is dáár geïndexeerd via `open-items/README.md`. Plus deze regel in memory `feedback_besa_workflow.md` over het "later" plan.
