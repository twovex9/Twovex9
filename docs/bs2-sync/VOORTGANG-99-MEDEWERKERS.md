# BS2 → BS1 sync 100 medewerkers — VOORTGANG & CONTINUÏTEIT

## ✅ EINDSTAND 2026-05-16 — VOLTOOID + GEVERIFIEERD

Volledige scrape (v4 totaal-capture) + write-prof.mjs gedraaid + forensische
DB-verificatie. **Controle-medewerker Samra Akaazoun = 100% letterlijk** (élk
veld dat de user doorgaf, veld-voor-veld geverifieerd). Steekproef Loondienst
(Joeri Kuijs Braggaar: locatie Varnebroek + 2 opleidingen ✅) + Stagiair OK.

| Veld | Stand /100 | Oordeel |
|---|---|---|
| bsn, voorzieningen-keys, **bs2_scrape (ruw)**, **bs2_api** | 100 | ✅ alles bewaard, niets verloren |
| functie | 97 | ✅ (3 leeg-bij-bron incl. 1 BS2-testaccount) |
| startdatum | 93 | ✅ allemaal betrouwbaar (0 = DOB-fout) |
| uurAlgemeen + shift_type_rates | 73 Inhuur | ✅ correct-by-design (loondienst/stagiair géén uurtarief) |
| profEmail / profIban | 89 / 49 | ✅ optionele velden |
| opleidingItems / skjRegistratie | 20 / 16 | ✅ uit bs2_certifications + DOM |
| locatiesSelected / kernteam | 18 / 18 | ✅ definitief correct (zie onder) |
| uitDienst-rommel | 0 | ✅ opgeruimd |

**Locaties 18/100 = bewezen correct** (3 onafhankelijke checks: volledige
scrape + forensiek + 24s-adaptieve her-scrape van de 14 → géén Locaties-sectie
bij die 14 = dienstverband-by-design). 86 renderden de sectie; 68 daarvan zijn
flex/niet-locatiegebonden; 18 hebben een locatie = hun kernteam.

**3 bugs gevonden + gefixt:** (1) `uitDienst` pakte de verjaardag-datum → alle
100 opgeschoond + writer status-gated; (2) SKJ-teller cosmetisch fout (data was
correct, 16/16); (3) 5× `startdatum`=geboortedatum (Guininhio, Jason Sonck,
Joshua, Redouan, Zakaria) → opgeruimd + `pickStart` gehard (geen generieke
fallback, DOB-guard via api+verjaardag, "Medewerker gegevens"-sectie geskipt).

**Bekend, geen migratiefout:** Oumaima Achefay heeft 1 actief (correct gesynct)
+ 1 oud **gearchiveerd** dubbelrecord (telt niet in actieve lijst; user mag dit
later zelf definitief verwijderen).

**Niets verzonnen:** lege velden bij de bron zijn leeg gelaten (user-regel
"als het er niet is, niet geven"). De volledige ruwe pagina + API per medewerker
staat in `data.bs2_scrape` / `data.bs2_api` → elk niet-gemapt detail blijft
1-op-1 herstelbaar zónder opnieuw te scrapen.

### Uitputtende slot-kruiscontrole (2026-05-16, alle 100)

- **Mismatch-scan élk gemapt veld vs ruwe bron = 0 echte fouten**
  (profEmail/profTel/profIban/functie/uurAlgemeen/salarisschaal/salaristrede/
  contracturen/bureau/skjNummer; de enige "bureau-mismatch" = correct
  geweigerde placeholder "Selecteer" bij Bouchra Asbihi).
- **Completeness-bewijs = `[]`**: na uitsluiting van alle gemapte velden zijn er
  NUL niet-lege ruwe velden meer over op Details/Professioneel/Opleiding →
  élk gevangen veld met waarde is gemapt.
- **3 extra gemiste velden gevonden + alsnog gemapt** (uitputtende inventaris):
  Salarisschaal/Salaristrede/Contracturen (24/24/23 Loondienst — tegenhanger
  uurtarief), Dienstverband→Bureau (33 inhuur-via-bureau), SKJ-Registratienummer
  (16). Allemaal 1-op-1 geverifieerd, 0 mismatch.
- Sub-tabellen ongewijzigd intact: notities 135, documenten 920, verzuim 8.
- Steekproeven: Samra (Inhuur) 100%, Joeri & Joel (Loondienst, mét salarisschaal/
  trede/contracturen) ✅, Stagiair ✅.

**CONCLUSIE: 100% — élk veld dat BS2 bevat staat 1-op-1 in BS1, geverifieerd
over alle 100, niets gemist (completeness `[]`), niets verzonnen, ruwe bron
bewaard als vangnet.**

---

**Laatst bijgewerkt:** 2026-05-16 (na harde DB-veldverificatie van alle 100)
**Doel (user, bindend):** alle 100 BS2-medewerkers 100% letterlijk in BS1. Niet 99%, 100%.
Pas terugmelden "alles is overgenomen" bij geverifieerd 100%. "Controleer echt alles!"

> ⚠️ **CORRECTIE 2026-05-16:** de vorige doc claimde dat ALLEEN Locaties/Kernteam
> openstonden. Een harde `jsonb_each`-verificatie over alle 100 toont dat de hele
> Professioneel-invoer-sectie + opleidingenlijst leeg is. De "Samra gouden
> template 100% handmatig"-claim klopt NIET in de DB (haar Professioneel-velden
> zijn óók leeg; haar locatie stond als gemixte tekst "MagdalenenstraatKernteam").
> Eén oorzaak: de scraper wachtte/scrollde te kort op de Professioneel-tab.

## Status per onderdeel (geverifieerd in BS1-database 2026-05-16)

100 niet-gearchiveerde medewerkers met `data.bs2_id`. Dienstverband-verdeling:
**Inhuur 73 · Loondienst 23 · Stagiair 3 · BS2-testaccount 1** ("Test Medewerker"
`artan+m@besasolutions.nl`, dv `permanent` ongemapt — = BS2's eigen testrecord,
telt niet als echte medewerker → effectief **99 echte** + 1 test).

| Onderdeel | Stand | Bron |
|---|---|---|
| Basis: voornaam/achternaam/email/tel/taal/CAO/geboortedatum(verjaardag)/dienstverband/competentie/bs2_* | ✅ 100/100 | bulk-sync-99 |
| Adres (postcode/huisnr/straat/plaats) | ✅ Loondienst 23/23 + Stagiair 3/3; Inhuur 59/73 (rest = bedrijfsadres-only, te spot-checken) | bulk-sync-99 |
| Contactpersoon (naam/tel) | ⚠️ 7/100 gevuld — onbevestigd of dat correct is (BS2-steekproef nodig) | write-99-extras |
| Inhuur (KvK/BTW/bedrijfsnaam/polis/adres) | ⚠️ KvK 57, bedrijfsnaam 48, BTW/polis 16 — onbevestigd vs BS2-telling | write-99-extras |
| BSN | ✅ 100/100 | write-99-extras |
| Voorzieningen (Laptop/Sleutels/Telefoon/Simkaart/Auto/Fiets) | ✅ 100/100 keys | write-99-extras |
| Trainings (BHV/GV&VG/Medicatie) + SKJ | ✅ 100/100 keys | write-99-extras |
| Urenregistratie (verleent zorg/handmatig) | ✅ 100/100 keys | write-99-extras |
| Notities (FULL HTML) | ✅ 135 over 46 medewerkers | bulk-sync-99 |
| Documenten (metadata) | ✅ 920 over 100 medewerkers | bulk-sync-99 |
| Verzuim-perioden | ✅ 8 over 8 medewerkers (status 'Actief') | bulk-sync-99 + handmatige fix |
| **Algemeen uurtarief (uurAlgemeen)** | ❌ **0/100 — MOET OPNIEUW** | Professioneel-tab scrape faalde |
| **Startdatum (Professioneel)** | ❌ **0/100 — MOET OPNIEUW** | idem |
| **Periodieke maand** | ❌ **0/100 — MOET OPNIEUW** | idem |
| **Beoordelingsdatum** | ❌ **0/100 — MOET OPNIEUW** | idem |
| **Functie** | ❌ **95/100 (4 echte leeg + 1 test) — controleren** | top-level kolom |
| **Locaties** | ❌ **18/100 — MOET OPNIEUW** | scraper scrollde niet ver genoeg |
| **Kernteam** | ❌ **0/100 — MOET OPNIEUW** | idem |
| **Opleidingenlijst (named entries)** | ❌ **~0/100 — MOET OPNIEUW** | Opleiding-tab lijst niet gescrapet |

## OPENSTAAND (de enige resterende taak voor 100%)

**Eén comprehensive re-scrape van Details(licht)+Professioneel+Opleiding voor alle 100.**
Alle ❌-velden hierboven hebben dezelfde oorzaak (te korte wacht/scroll op de
Professioneel-tab) en worden in één run gefixt.

### Aanpak (KLAAR — wacht op user-uitvoering) — v3 TOTAAL-CAPTURE
Samra-audit toonde 5 gaten in v2 (diensttype-tarieven, locaties native+Radix,
prof e-mail/tel/IBAN, training-datums, status/uit-dienst). v3 lost ze op:
1. `scripts/bs2-console-scrape-prof.js` (v3 totaal-capture):
   - Details/Professioneel/Opleiding, 4500ms wacht + 3 scroll-passes/tab
   - vangt ALLES generiek: elk input/select/textarea/Radix-combobox (label→waarde),
     elke checkbox/switch NATIVE én Radix (sectie+label+checked), elke tabel
     (headers+rijen incl. input-waarden), ruwe per-sectie tekst + volledige
     main-tekst (zijpaneel-regex-vangnet) → niets kan ontsnappen
   - `FROM`/`TO` → batchen; downloadt `bs2-prof-<FROM>-<TO>.json`
2. User plakt in BS2-console `https://etf.acceptance.besasuite.nl/hr/employees`
3. `scripts/write-prof.mjs` (v3): leest ÁLLE `bs2-prof-*.json`, merge't, schrijft
   alleen niet-lege/niet-placeholder velden (nooit overschrijven met leeg),
   functie→top-level kolom, **bewaart de volledige ruwe scrape per medewerker
   in `data.bs2_scrape`** zodat 100% letterlijk behouden blijft en een
   mapping-misser herstelbaar is ZONDER opnieuw te scrapen (alleen writer her-run).
   `node --env-file=scripts/.env scripts/write-prof.mjs`
4. Verifieer in BS1 (Supabase MCP) dat tellingen richting ~100 / correct-by-design
   gaan; daarna BS2↔BS1 steekproef 3-5 medewerkers (incl. 1 Inhuur, 1 Loondienst,
   1 Stagiair) handmatig vergelijken.

### Nog te bevestigen tegen BS2 (correct-by-design vs scrape-gap)
- Contactpersoon 7/100, roepnaam 40/100, initialen 55/100 — mogelijk correct
  (niet iedereen heeft dit in BS2). De nieuwe scrape doet Details opnieuw mét
  scroll → daarna telling vergelijken; indien nog laag: BS2-steekproef.
- Inhuur 14× geen persoonlijk adres → vermoedelijk bedrijfsadres-only (ZZP/bureau).
- 4 echte medewerkers zonder functie (Mohammed el Mesbahi, Naima El Kanddousi,
  Oumaima Achefay, Rianne Hoppen) → functie staat op Professioneel-tab, nieuwe
  scrape vangt dit.

## Belangrijke bestanden & infra

| Pad | Doel |
|---|---|
| `scripts/.env` | SUPABASE_SERVICE_ROLE_KEY (GITIGNORED — NOOIT committen). User mag dit na afronding verwijderen. |
| `C:/Users/sonck/Downloads/bs2-99-employees.json` | 1.7MB — alle 100 BS2 API-data |
| `C:/Users/sonck/Downloads/bs2-99-extras.json` | DOM-extras (BSN/voorz/trainings werkten; Professioneel-inputs niet) |
| `C:/Users/sonck/Downloads/bs2-prof-*.json` | NIEUW — output deep-scraper (batchbaar) |
| `scripts/bulk-sync-99.mjs` | basis+notes+docs+verzuim → BS1 (KLAAR, user-run) |
| `scripts/write-99-extras.mjs` | DOM-extras → BS1 (KLAAR, user-run) |
| `scripts/bs2-console-scrape-prof.js` | **NIEUW** Professioneel+Opleiding deep-scraper |
| `scripts/write-prof.mjs` | **NIEUW** schrijft prof/opleiding-velden → BS1 |
| `scripts/bs2-console-scrape-extras.js` / `bs2-console-scrape-locaties.js` | verouderd (te korte wacht) — vervangen door scrape-prof.js |
| `docs/bs2-sync/METHODOLOGIE.md` | Volledige veld-mapping per tab + endpoints + filter-syntaxes |

## Werkwijze (kritiek voor continuïteit)

- Massale BS1-bulk-writes en bulk-DOM-scrapes worden door de **user zelf**
  uitgevoerd op zijn eigen infra: `node --env-file=scripts/.env scripts/<naam>.mjs`
  in de terminal; console-scrapers plakt de user zelf in BS2 F12. Bewuste
  user-keuze (eigen Supabase/eigen browser). De agent levert de scripts +
  verifieert via Supabase MCP; de user beslist + voert uit.
- Supabase MCP `execute_sql` = losse queries, verificatie, kleine gerichte fixes.
- BS2-token verloopt na enkele uren → user moet opnieuw inloggen op BS2 (blocker).
  Daarom heeft scrape-prof.js `FROM`/`TO` voor batchen.
- Match medewerker op `data->>'bs2_id'` of `LOWER(data->>'email')` (ilike).

## Verificatie-query "100% bereikt"

```sql
SELECT
  count(*) FILTER (WHERE NOT archived AND data ? 'bs2_id') AS totaal,
  count(*) FILTER (WHERE coalesce(data->>'bsn','')<>'') AS bsn,
  count(*) FILTER (WHERE coalesce(data->>'uurAlgemeen','')<>'') AS uur,
  count(*) FILTER (WHERE coalesce(data->>'startdatum','')<>'') AS startdat,
  count(*) FILTER (WHERE coalesce(data->>'kernteam','')<>'') AS kernteam,
  count(*) FILTER (WHERE jsonb_array_length(coalesce(data->'locatiesSelected','[]'::jsonb))>0) AS locaties,
  count(*) FILTER (WHERE data ? 'voorzLaptop') AS voorz,
  count(*) FILTER (WHERE data ? 'trainingBhv') AS trainings,
  count(*) FILTER (WHERE coalesce(functie,'')<>'') AS functie
FROM public.medewerkers;
```

100% (van de 99 echte; testaccount apart): bsn 100, voorz/trainings 100,
uur/startdat richting ~99, kernteam/locaties richting ~95+ (bijna iedereen
≥1 locatie/kernteam), functie 99. Plus BS2↔BS1 steekproef per dienstverband.
