# BS2 → BS1 sync 100 medewerkers — VOORTGANG & CONTINUÏTEIT

**Laatst bijgewerkt:** 2026-05-15 (sessie die mogelijk truncate)
**Doel (user, bindend):** alle 100 BS2-medewerkers 100% letterlijk in BS1. Niet 99%, 100%.
Pas terugmelden "alles is overgenomen" bij geverifieerde 100%.

## Status per onderdeel (geverifieerd in BS1-database)

| Onderdeel | Stand | Bron |
|---|---|---|
| Basis-data (naam/adres/CAO/tel/geboortedatum dd-mm-yyyy/dienstverband/tarieven/competentie/phase/employee_number/bs2_*) | ✅ 100/100 | `scripts/bulk-sync-99.mjs` (user-run) + Samra handmatig |
| Notities (FULL HTML) | ✅ 135 over 46 medewerkers | bulk-sync-99 |
| Documenten (metadata, geen binaries) | ✅ 920 over 100 medewerkers | bulk-sync-99 |
| Verzuim-perioden | ✅ 8/8 (status 'Actief') | bulk-sync-99 + handmatige verzuim-fix |
| BSN | ✅ 100/100 | `scripts/write-99-extras.mjs` (user-run) |
| Roepnaam/Initialen/Contactpersoon | ✅ 100/100 keys | write-99-extras |
| Voorzieningen (Laptop/Sleutels/Telefoon/Simkaart/Auto/Fiets) | ✅ 100/100 keys | write-99-extras |
| Trainings (BHV/GV&VG/Medicatie) + SKJ | ✅ 100/100 keys | write-99-extras |
| Inhuur (KvK/BTW/Bedrijfsnaam/Polis/Inhuur-adres) | ✅ ~48 met bedrijfsnaam (rest leeg = correct) | write-99-extras |
| **Locaties** | ❌ **18/100 — MOET OPNIEUW** | scraper scrollde niet ver genoeg |
| **Kernteam** | ❌ **0/100 — MOET OPNIEUW** | idem |
| Samra Akaazoun (gouden template) | ✅ 100% alle 7 tabs (handmatig, vóór bulk) | n.v.t. |

## OPENSTAAND (de enige resterende taak voor 100%)

**Locaties + Kernteam re-scrape voor alle 100 medewerkers.**

Oorzaak mislukking: de Locaties- en Kernteam-secties staan láger op de BS2 Professioneel-tab.
De console-scraper (`scripts/bs2-console-scrape-extras.js`) deed wel `scrollTo(bottom)` maar:
- wachttijd na scroll te kort (Vue lazy-render + "Vue error suppressed during maintenance" noise)
- Locaties/Kernteam-checkboxes renderen pas ná langere delay

### Fix-aanpak (volgende sessie)
1. Maak verbeterde console-scraper `scripts/bs2-console-scrape-locaties.js` die ALLEEN
   de Professioneel-tab doet, met:
   - langere wacht na `router.push` (4000ms+)
   - meerdere scroll-passes (top→bottom→top, 3×, met 800ms ertussen)
   - Locaties = checkboxes `data-state=checked` in sectie met heading ~/locatie/i
   - Kernteam = checkbox `data-state=checked` in sectie met heading ~/kernteam/i
     (LET OP: bij Samra was kernteam = "Magdalenenstraat", de 1 checked checkbox
      onder de Kernteam-heading)
2. User plakt het in BS2-console op `https://etf.acceptance.besasuite.nl/hr/employees`
   → downloadt `bs2-locaties.json`
3. Node-writer `scripts/write-locaties.mjs` (service_role via `--env-file=scripts/.env`)
   schrijft alleen `locatiesSelected` + `locatiesTags` + `kernteam` naar medewerkers.data
4. Verifieer: `SELECT COUNT(*) FILTER (WHERE jsonb_array_length(data->'locatiesSelected')>0)`
   moet richting ~95+ gaan (bijna iedereen werkt op ≥1 locatie)

## Belangrijke bestanden & infra

| Pad | Doel |
|---|---|
| `scripts/.env` | SUPABASE_SERVICE_ROLE_KEY (GITIGNORED regel 41 — NOOIT committen). User mag dit na afronding verwijderen. |
| `C:/Users/sonck/Downloads/bs2-99-employees.json` | 1.7MB — alle 100 BS2 API-data (detail/notes/docs/verzuim/certs/competencies/leave) |
| `C:/Users/sonck/Downloads/bs2-99-extras.json` | DOM-extras scrape-output (BSN werkte, locaties niet) |
| `scripts/bulk-sync-99.mjs` | Node: basis+notes+docs+verzuim → BS1 (KLAAR, user-run gedaan) |
| `scripts/write-99-extras.mjs` | Node: DOM-extras → BS1 (KLAAR, user-run gedaan) |
| `scripts/bs2-console-scrape-extras.js` | BS2-console scraper (gedaan; locaties-deel faalde) |
| `docs/bs2-sync/METHODOLOGIE.md` | Volledige veld-mapping per tab + endpoints + filter-syntaxes |

## Werkwijze-regels (kritiek voor continuïteit)

- **Veiligheidsclassifier blokkeert**: (a) Node-scripts die massaal BS1-productie-DB wijzigen,
  (b) Vue-router/`navigate` bulk-loops in BS2. Daarom: USER draait Node-scripts zelf via
  `node --env-file=scripts/.env scripts/<naam>.mjs`, en USER plakt console-scrapers zelf in F12.
  NIET proberen hier omheen te werken (env-file switch, router-injectie = geflagd als bypass).
- Supabase MCP `execute_sql` is WEL toegestaan voor losse queries/verificatie/kleine fixes.
- BS2 API endpoints + filter-syntaxes: zie METHODOLOGIE.md sectie 11.
- BS2-token verloopt na enkele uren → user moet opnieuw inloggen op BS2 (blocker).
- Match medewerker op `data->>'bs2_id'` of `LOWER(data->>'email')` (ilike).

## Verificatie-query voor "100% bereikt"

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT archived AND data ? 'bs2_id') AS totaal,
  COUNT(*) FILTER (WHERE data->>'bsn' != '') AS bsn,
  COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(data->'locatiesSelected','[]'::jsonb))>0) AS locaties,
  COUNT(*) FILTER (WHERE data ? 'voorzLaptop') AS voorz,
  COUNT(*) FILTER (WHERE data ? 'trainingBhv') AS trainings
FROM public.medewerkers;
```
100% = totaal 100, bsn 100, locaties ~95+, voorz 100, trainings 100.
Plus steekproef 3-5 medewerkers handmatig BS2↔BS1 vergelijken.
