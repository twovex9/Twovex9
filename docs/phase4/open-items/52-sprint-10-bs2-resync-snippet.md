# Item 52 — Sprint 10: BS2 data resync via browser-snippet

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open) — **vereist user-actie na merge** (zie stappen)
**Master-plan**: S10 in `../v2-master-plan.md`
**Gerelateerd**: items 36 (eerste poging gefaald), 38 (root cause + nieuwe aanpak)

## Wat is gedaan

### Browser-snippet `scripts/bs2-browser-snippet.js`

Self-contained IIFE die in de BS2 DevTools console gepaste kan worden. Werkt **omdat** browser-context automatisch session-cookies + CSRF meestuurt (Bearer-token-only had item 38 al laten falen).

**Wat doet de snippet**:
1. Verifieert dat origin = `https://etf.acceptance.besasuite.nl`
2. Fetcht alle 15 BS2 endpoints parallel (concurrency=3):
   - `/api/care-types`, `/api/locations`, `/api/agency`, `/api/competencies`,
   - `/api/certifications`, `/api/municipalities`, `/api/organizations`,
   - `/api/salary-scales`, `/api/incident-categories`,
   - `/api/employees`, `/api/clients`, `/api/dispositions`,
   - `/api/incidents`, `/api/invoices`, `/api/shifts`
3. Heavy endpoints krijgen `?per_page=10000` om paginatie te omzeilen
4. Logt progress per endpoint (✅/❌ + count + ms)
5. Triggert auto-download: `bs2-export-full.json`
6. Output format matcht exact wat `scripts/bs2-full-import.mjs` verwacht:
   ```json
   {
     "fetchedAt": "ISO",
     "source": "https://etf.acceptance.besasuite.nl",
     "data": {
       "/api/care-types": [...],
       "/api/employees": [...],
       ...
     }
   }
   ```

### bs2_id preservation (al aanwezig)

Bevinding tijdens S10 review: alle PII-tabellen (medewerkers, clienten, beschikkingen, facturen, planning) hebben **al** `bs2_id: r.id` in hun `data` jsonb sinds Phase 4. Geen wijziging nodig aan `bs2-full-import.mjs`. De legacy gap uit item 38 ("BS2-UUID niet bewaard in Phase 3") was inmiddels gesloten.

## 🚨 User-actie vereist (na merge van deze PR)

### Stappen voor user

1. **Open BS2 in Chrome** — `https://etf.acceptance.besasuite.nl/home` (logged in)
2. **Open DevTools Console** — `F12` → tab "Console"
3. **Plak heel `scripts/bs2-browser-snippet.js`** in console + Enter
4. **Wacht ~30-60 seconden** — je ziet progress per endpoint (✅/❌)
5. **Browser triggert auto-download** — `bs2-export-full.json` (15-20 MB verwacht)
6. **Verplaats** bestand naar:
   ```
   besa-suite-etf/scripts/bs2-exports/bs2-export-full.json
   ```
   (overschrijf de bestaande oude file)
7. **Run import-pipeline** vanuit `besa-suite-etf/`:
   ```bash
   # PowerShell op Windows:
   $env:SUPABASE_SERVICE_KEY = "PLAK_SERVICE_KEY_HIER"
   node scripts/bs2-full-import.mjs
   node scripts/bs2-fk-resolve.mjs
   ```

### Hoe service_role key kopiëren

1. <https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj/settings/api>
2. Onder **Project API keys** → naast `service_role` → **Reveal** → Copy
3. Plak in PowerShell `$env:SUPABASE_SERVICE_KEY = "..."`

Niet committen — staat in `.gitignore`.

## Wat dit oplost

Per item 38, BS1 ↔ BS2 count-verschillen:

| Tabel | BS2 | BS1 (vóór resync) | Na resync (verwacht) |
|---|---:|---:|---:|
| medewerkers | 100 | 103 | 100 (BS1-extras kunnen archived blijven) |
| cliënten | 87 | 93 | 87 |
| beschikkingen | ~251 | 251 | gelijk |
| planning | ~4400 | 4461 | gelijk |

Idempotent: upsert met BS2 `id`, dus meerdere runs is veilig.

## Validatie (na user-actie)

User kan checken in Supabase SQL Editor:

```sql
select count(*) from medewerkers where archived=false;
select count(*) from clienten where archived=false;
select count(*) from beschikkingen;
select count(*) from planning;
```

Vergelijk met BS2 counts (laatste view in BS2).

## Test plan (PR-merge)

- [ ] CI groen (snippet is alleen JS-file, geen JS-impact op site)
- [ ] Vercel deploy slaagt (geen runtime wijzigingen)
- [ ] Snippet werkt syntactisch — handmatige `node -c` check NIET mogelijk want het is browser-script met `await`-top-level

## Acceptance (master-plan S10)

- ✅ Browser-snippet geschreven met fetch-loop alle endpoints
- ✅ Document hoe user runt (in BS2 console paste + auto-download)
- ✅ `bs2_id` preservation in `data` jsonb (al aanwezig)
- ⏳ User runs → counts gelijk maken aan BS2 (na merge)

## Status update bij merge

Bij merge: master-plan S10 → ✅ DONE + PR-nummer. Direct start Sprint 11 (Authenticated E2E tests met test-user, 2u). User-actie loopt asynchroon.
