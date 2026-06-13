# Future Flow — ZZP/inhuur proforma-facturatie (native)

> Spec uit inwerk-gesprek **2026-06-03** (Jason). Future Flow (FF = deze app) wordt de
> **zelfstandige bron**: de proforma-factuur komt uit FF's **eigen planning** (`planning`-tabel),
> niet meer uit BS2. BS2-facturen (`invoices`) blijven als **historie** bewaard (DIEHARD: niets
> verwijderen). Strikt **los** van `facturen` (cliënt→beschikking→gemeente, disposition-model).

## Beslissingen (Jason, 2026-06-03)
1. **Bron = Future Flow-planning.** FF genereert de proforma zelf uit `planning`. BS2 wordt later
   volledig gemigreerd; FF moet nú al standalone werken met extra functies.
2. **ZZP bewerkt op web ÉN mobiel** (beide tegelijk).
3. **Bureau-login: ja** — streng afgeschermde rol `Detacheringsbureau`, RLS-gescoped op het eigen
   bureau, uitsluitend facturen-pagina's. E-mailadressen levert Jason later aan (account-aanmaak).

## Functioneel verhaal
- HR voert uurtarief in (`medewerkers.data.uurAlgemeen`; alle 73 inhuur hebben dit). Tarief hangt
  via de naam-match aan de planning-diensten.
- Per dienst: medewerker, locatie, datum, netto-uren = `(einde_iso−start_iso)/3600 − pauze_uren`.
- Op de **1e v/d maand**: per **(medewerker, locatie, werk-maand)** staat een **proforma-factuur**
  klaar = Σ diensten × tarief. **Aparte factuur per locatie** → kosten splitsen per locatie
  (winst/verlies per locatie).
- ZZP ziet zijn proforma, kan **eigen factuurnummer + logo + extra gegevens** invoeren en de
  diensten aanpassen:
  - tarief/bedrag gewijzigd → **🔴 rood** signaal voor de controleur;
  - dienst verwijderd → **🟠 oranje** signaal.
- Controleur ziet **side-by-side**: proforma links, ZZP-factuur rechts, totaal onderaan
  vergelijkbaar.
- **Overuren / korter gewerkt** → **teamleider-akkoord** → bij akkoord wordt de **planning
  bijgewerkt** (gerichte `.update().eq('id')`, geaudit, DIEHARD-veilig).
- **Detacheringsbureau** logt in (alleen facturen, eigen mensen), ziet uren per locatie, legt eigen
  factuur naast de proforma, accordeert → **klaar voor betaling**.
- **Reconciliatie per locatie + totaal**: binnengekomen / goedgekeurd / afgewezen /
  **nog te verwachten** (uit planning), zodat eind v/d maand helder is wat we per locatie én totaal
  kwijt zijn (ook als facturen laat/niet binnenkomen).

## Data-realiteit (geverifieerd 2026-06-03)
- `planning.locatie` ~100% gevuld op inhuur-diensten. Mei-2026: 768 diensten, 6 locaties →
  **71 proforma's** (39 ZZP'ers × locaties). Apr 807/7, jun 574/16.
- Alle 73 inhuur (40 direct ZZP + 33 via bureaus Level Up/Optimum Flex/Zorgkracht Direct/BLND)
  hebben persoonlijk `uurAlgemeen`. Bureau `standaard_uurtarief` = fallback.
- `planning.teamlid` = naam-string → join `lower(btrim(voornaam||' '||achternaam))` (≈63/64).
- inhuur-detectie: `data->>'bs2_employment_type'='hiring'` OR `dienstverband ~ inhuur|zzp`.
- bureau-koppeling: `medewerkers.data->>'bureau'` = bureau-NAAM (= `bureaus.naam`).

## Data-model (FF-native, canoniek — los van `invoices`/`facturen`)
"ZZP" hier = **alle inhuur** (direct ZZP + via bureau), consistent met `facturen_zzp_dashboard`.

### `zzp_facturen` — 1 rij per (medewerker × locatie × werk-maand)
identiteit: `id uuid pk`, `medewerker_id uuid`, `medewerker_naam text`, `bs2_id text`,
`bureau text` (null = direct ZZP), `locatie text`, `jaar int`, `maand int`.
proforma-baseline: `proforma_tarief`, `proforma_uren`, `proforma_bedrag`, `proforma_diensten int`,
`proforma_gegenereerd_op timestamptz`.
ZZP-invoer: `eigen_factuurnummer text`, `logo_url text`, `extra_gegevens jsonb`,
`ingediend_uren numeric`, `ingediend_bedrag numeric`.
status/flags: `status text` (klaargezet→ingediend→in_behandeling→goedgekeurd/afgewezen→
klaar_voor_betaling), `heeft_bedrag_afwijking bool` (🔴), `heeft_verwijderde_dienst bool` (🟠),
`afwijking_bedrag numeric` (ingediend−proforma).
stempels: `submitted_at`, `approved_at`, `rejected_at`, `afwijzing_reden text`,
`bureau_geaccordeerd_op`, `bureau_geaccordeerd_door text`, `betaling_klaar_op`.
audit: `archived bool` (soft-delete; NOOIT hard), `aanmaakdatum`, `laatst_gewijzigd`.

### `zzp_factuur_regels` — 1 rij per dienst
`id uuid pk`, `factuur_id uuid` (FK, GEEN cascade-delete), `planning_dienst_id text` (→`planning.id`),
`datum date`, `dag text`, `start_iso`, `einde_iso`, `pauze_uren numeric`,
proforma-baseline: `proforma_uren`, `proforma_tarief`, `proforma_bedrag`, `omschrijving text`,
ZZP-bewerkt: `ingediend_uren`, `ingediend_tarief`, `ingediend_bedrag`,
flags: `verwijderd bool` (🟠), `gewijzigd bool` (🔴),
overuren-lus: `overuren_status text` (null|aangevraagd|goedgekeurd|afgewezen),
`overuren_oude_einde`, `overuren_nieuwe_einde`, `overuren_reden text`, `overuren_teamleider text`,
`overuren_behandeld_op`, `sort_order int`, audit-stempels.

### `zzp_factuur_transitions` — audit + goedkeuringslus
`id uuid pk`, `factuur_id uuid`, `status text`, `actor_email text`, `actor_naam text`,
`actor_type text` (zzp|bureau|controleur|teamleider|systeem), `comment text`, `data jsonb`,
`created_at timestamptz`.

## Generatie (idempotent, niet-destructief — DIEHARD)
`genereer_zzp_proforma(p_jaar int, p_maand int)`:
- groepeer inhuur-diensten per (medewerker, locatie) voor die maand; upsert proforma-rij + regels.
- **NOOIT** een bewerkte/ingediende/goedgekeurde factuur overschrijven; alleen ontbrekende rijen
  aanmaken, of de baseline van **onaangeroerde** `klaargezet`-concepten verversen.
- pg_cron op de **1e v/d maand** → genereer vorige maand. On-demand draaibaar voor backfill/test.
- handmatig aangemaakte/bewerkte rijen blijven intact (idempotent: 2e run = 0 nieuwe).

## RLS
- interne rollen: permissief + frontend permissions-gate (zoals rest v/d suite).
- **ZZP-account**: ziet alleen eigen rijen (`bs2_id`/`medewerker_id` = eigen account).
- **bureau-account**: ziet alleen rijen van het eigen bureau (`bureau_users`-mapping → `bureau`).

## Fasen (elk: 2 clean runs Chrome MCP light+dark vóór de volgende; self-merge)
- [ ] **1. Fundament** — schema (3 tabellen) + `genereer_zzp_proforma` + cron + data-laag
  `zzp-facturen-data.js` + reviewer-overzicht "proforma's per locatie staan klaar".
- [ ] **2. ZZP-bewerken (web + mobiel)** — eigen nummer/logo/extra + diensten aanpassen +
  rood/oranje-detectie + indienen.
- [ ] **3. Side-by-side vergelijking** (controleur) — proforma ↔ ingediend, totaal onderaan,
  rood/oranje pills.
- [ ] **4. Overuren → teamleider → planning-update** — goedkeuringslus + gerichte planning-bijwerk
  + meldingen/push.
- [ ] **5. Detacheringsbureau-login** — rol + `bureau_users` + RLS-scoping + beperkte nav +
  accordering → klaar voor betaling.
- [ ] **6. Reconciliatie per locatie + totaal** — binnen/goedgekeurd/afgewezen/nog-te-verwachten,
  per locatie en totaal (uitbreiding facturen-indiening + Financiën › Locaties).

## Werkomgeving
- Repo: **`C:\Users\sonck\dev\future-flow`** (buiten OneDrive; commit+push per blok). Remote
  `twovex9/twovex9`. Mobiel: `…\OneDrive\…\Future Flow-mobile`.
