# Open items — aparte files per item

**Vanaf 2026-05-12**: nieuwe open items worden hier geplaatst als aparte `.md` files i.p.v. inline in `04-open-items.md`.

## Waarom

Bij parallelle PR's die items toevoegden aan `04-open-items.md` ontstonden merge-conflicten — beide PR's bewerkten dezelfde regels (anchor vóór "Definitie van klaar"-sectie).

Item 28's "append-at-end" regel verminderde maar elimineerde dit niet (twee items op dezelfde anchor = nog steeds conflict).

**Echte fix**: één file per item. PR's wijzigen verschillende files → 0% kans op merge-conflict ooit nog.

## Conventie

| Aspect | Regel |
|---|---|
| Bestandsnaam | `<NN>-<slug>.md`, NN = nummer (zero-padded niet nodig), slug = korte kebab-case beschrijving |
| Voorbeelden | `29-client-detail-tabs-verification.md`, `30-performance-benchmarks.md`, `31-rls-audit.md` |
| Index | Deze README.md — append nieuwe items aan de tabel hieronder |
| Items 1-28 | Blijven in `../04-open-items.md` (geschiedenis, niet migreren) |
| Items 29+ | Aparte files hier |

## Voor elk nieuw item

1. Maak `<NN>-<slug>.md` met de item-inhoud (kies volgend volgnummer)
2. Voeg 1 regel toe aan de tabel hieronder (kleine kans op merge-conflict op die regel, maar makkelijk te resolven)
3. **NIET** wijzigen in `../04-open-items.md` (gebruik daar alleen "Recente items"-link)

## Index

| # | Titel | Status | Datum |
|---|---|---|---|
| 29 | [Cliënt-detail tabs verificatie](29-client-detail-tabs-verification.md) | ✅ Voltooid | 2026-05-12 |
| 30 | [Performance benchmarks baseline](30-performance-benchmarks.md) | ✅ Voltooid | 2026-05-12 |
| 31 | [Preconnect optimization + item 27 partial cleanup](31-preconnect-and-confirm-fix.md) | ✅ Deels (2 van 8 confirm-fixes) | 2026-05-12 |
| 32 | [Item 27 volledig gesloten + CI check actief](32-item-27-volledig-gesloten.md) | ✅ Voltooid | 2026-05-12 |
| 33 | [Cliënt-detail Betalingen-tab geïmplementeerd](33-betalingen-tab-implementatie.md) | ✅ Voltooid (1 van 4 placeholders) | 2026-05-12 |
| 34 | [Cliënt-detail Contacten-tab geïmplementeerd](34-contacten-tab-implementatie.md) | ✅ Voltooid (2 van 4 placeholders) | 2026-05-12 |
| 35 | [Cliënt-detail Rapportages-tab geïmplementeerd](35-rapportages-tab-implementatie.md) | ✅ Voltooid (3 van 4 placeholders) | 2026-05-12 |
| 36 | [Final BS2 → BS1 data sync — POGING 1 GEFAALD](36-final-bs2-data-sync.md) | ⚠️ Bearer-only werkt niet, zie item 38 voor nieuwe aanpak | 2026-05-12 |
| **38** | **[BS2 sync eerste poging: bevindingen + v2 aanpak](38-bs2-sync-eerste-poging-bevindingen.md)** | ⏳ **Defer naar v2 — gebruik JS-snippet in BS2 console** | 2026-05-12 |
| 37 | [Cliënt-detail Vragenlijsten-tab geïmplementeerd](37-vragenlijsten-tab-implementatie.md) | ✅ Voltooid — **item 14 volledig gesloten** | 2026-05-12 |

## Voor v3

Indien zelfs de index-tabel hierboven conflicten geeft: switch naar `git ls-files docs/phase4/open-items/*.md` als dynamische index (no static table). Niet nu nodig.
