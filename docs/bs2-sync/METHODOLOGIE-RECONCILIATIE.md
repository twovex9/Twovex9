# BS2 → BS1 volledige overname + reconciliatie — DRAAIBOEK (hardcore)

> Bewezen werkend op **cliënten 2026-05-16**: 160→86 ontdubbeld; beschikkingen
> 251→134; facturen 990→911; incidenten 144→139; alle 9 tabs 100% ruw bewaard
> in `clienten.data.bs2_scrape`; alle connecties intact; veld-voor-veld
> geverifieerd. Ook vastgelegd in cross-session memory
> (`memory/methodology_bs2_reconciliatie.md`). Dit is het draaiboek voor élke
> "haal alles van entiteit X uit BS2 en zet 100% correct in BS1"-opdracht.

## Principes
- BS2 = waarheid (`etf.acceptance.besasuite.nl`, API `api.etf.acceptance.besasuite.nl`).
- 100%, niets verzinnen, leeg-bij-bron = leeg.
- Destructief = altijd backup-tabel + atomaire BEGIN/COMMIT + verificatie + akkoord.
- Scrapers: USER plakt in BS2 F12. Node-scripts: USER in PowerShell
  (`node --env-file=scripts/.env scripts/<naam>.mjs`). Agent: Supabase MCP voor
  diagnose/reconciliatie/verificatie. Match op `data->>'bs2_id'`.

## STAP 0 — Ontdubbelen (indien BS1 >> BS2)
Diagnose per bs2_id; keeper = rij mét nummer/connecties, loser = zonder.
Atomair: FK-kinderen omhangen loser→keeper, data-merge, DELETE losers (FK =
vangnet). Daarna 2e laag kruis-duplicaten op naam via BS2-referentietabel.

## STAP 1 — Endpoints ontdekken (DevTools network-recorder; NOOIT gokken)
USER opent één record in BS2, plakt logger-snippet (patcht fetch+XHR), klikt
door ALLE tabs + linker paneel, `__bs2dump()` → exacte `/api/`-lijst. Filter-
conventies: polymorf `filter[target][type]=..&filter[target][id]=..`;
FK `filter[<parent>]=..` of `filter[<parent>][id]=..`; detail `/api/<x>/<id>`.

## STAP 2 — Volledige API-scrape
Console-snippet: lijst `?limit=500`, per record élk endpoint gepagineerd
(`page&limit=100`, loop tot <100, cap 50). Bewaar alle tabs ruw. Download
`bs2-<entiteit>-full.json`.

## STAP 3 — Inspecteren (`scripts/inspect-<x>.mjs`, schrijft niets)
Totalen per tab, structuur rijke controle-record, voorbeeld per tab. → exacte
BS1-mapping afleiden in 1 keer.

## STAP 4 — Writer NIET-destructief (`scripts/write-<x>.mjs`)
- Volledige ruwe tabs → `<entiteit>.data.bs2_scrape` (100% behoud).
- Detailvelden → kolommen+data (alleen vullen). Lege tabellen vullen
  (delete-per-record + insert = idempotent). Geen-tabel-data → in `data`.
- Agent verifieert in DB: raw-totalen = BS2, controle-record veld-voor-veld.

## STAP 5 — Reconciliatie reeds-gevulde tabellen (destructief; akkoord)
Per tabel: read-only diagnose (telling, wezen, FK-kinderen via
`pg_constraint contype='f' confrelid`, CHECK via `pg_get_constraintdef`,
toegestane waarden, samples) → plan + akkoord → atomair:
`BEGIN; CREATE TABLE _<t>_oud_bak AS SELECT *; DELETE; INSERT ... SELECT FROM
clienten c, jsonb_array_elements(coalesce(c.data->'bs2_scrape'->'<tab>',
'[]'::jsonb)) x WHERE c.data ? 'bs2_scrape'; COMMIT;`
Map élk veld, CHECK exact respecteren, status→BS1-vocabulaire, fk = `c.id`
(0 wezen), multi-parent `DISTINCT ON (x->>'id')`, ruw + bs2_id in jsonb.
Verifieer: telling=BS2, 0 wezen, CHECK-geldig, backup ok, controle-record 1-op-1.

## STAP 6 — Eindrapport
BS1-nu vs BS2, 0 wezen, controle-record veld-voor-veld, backups, eerlijke noten.

## Bekende constraints/endpoints — zie `memory/methodology_bs2_reconciliatie.md`
(beschikkingen/facturen/incidenten CHECK's; client-endpoints; medewerker-
endpoints nog te ONTDEKKEN via STAP 1).

## Templatescripts (`future-flow/scripts/`)
clienten: inspect-clients.mjs / write-clients.mjs / test-clients.mjs.
medewerkers: bs2-console-scrape-prof.js / write-prof.mjs / test-prof-scrape.mjs.
Hergebruik als sjabloon.

## Backups na cliënten-run (user mag zelf droppen)
`_beschikkingen_oud_bak` (251), `_facturen_oud_bak` (990),
`_incidenten_oud_bak` (144) + Supabase PITR.
