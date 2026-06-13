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
| 39 | [RLS-policies security audit (rapport)](39-rls-audit.md) | ✅ Voltooid — audit rapport + v2 hardening aanbevelingen | 2026-05-12 |
| 40 | [GDPR Art. 9 compliance verzuim](40-gdpr-art-9-verzuim.md) | ✅ Compliance rapport + v2 actieplan + quick-wins (DPA tekenen) | 2026-05-13 |
| 41 | [E2E test-suite skelet (Playwright)](41-e2e-test-suite.md) | ✅ Voltooid — 22 tests in 3 spec-files | 2026-05-13 |
| **42** | **[BS2 → BS1 feature parity gap-analyse](42-bs2-feature-parity-gap.md)** | 🟡 **Gap-analyse compleet — Sprint 1 Rollen volgende** | 2026-05-13 |
| 37 | [Cliënt-detail Vragenlijsten-tab geïmplementeerd](37-vragenlijsten-tab-implementatie.md) | ✅ Voltooid — **item 14 volledig gesloten** | 2026-05-12 |
| 43 | [Sprint 1: Rollen-organogram (BS2 parity)](43-sprint-1-rollen-organogram.md) | ✅ Voltooid PR #24 | 2026-05-13 |
| 44 | [Sprint 2: RLS hardening kritieke tabellen](44-sprint-2-rls-hardening-critical.md) | ✅ Voltooid PR #25 | 2026-05-13 |
| 45 | [Sprint 3: RLS hardening salaris + uren](45-sprint-3-rls-salaris-uren.md) | ✅ Voltooid PR #27 | 2026-05-13 |
| 46 | [Sprint 4: Planning filter-voorinstellingen](46-sprint-4-planning-voorinstellingen.md) | ✅ Voltooid PR #28 | 2026-05-13 |
| 47 | [Sprint 5: Planning Exporteren CSV](47-sprint-5-planning-export-csv.md) | ✅ Voltooid PR #29 | 2026-05-13 |
| 48 | [Sprint 6: Planning Financiën (KPI parity)](48-sprint-6-planning-financien.md) | ✅ Voltooid PR #30 | 2026-05-13 |
| 49 | [Sprint 7: HR Salarisadministratie — Dienst-gebaseerde export](49-sprint-7-hr-salarisadmin-shift-export.md) | ✅ Voltooid PR #31 | 2026-05-13 |
| 50 | [Sprint 8: Taken filters/statussen](50-sprint-8-taken-filters.md) | ✅ Voltooid PR #32 | 2026-05-13 |
| 51 | [Sprint 9: Beleid documenten (Reset + Kolommen)](51-sprint-9-beleid-documents.md) | ✅ Voltooid PR #33 | 2026-05-13 |
| 52 | [Sprint 10: BS2 data resync via browser-snippet](52-sprint-10-bs2-resync-snippet.md) | ✅ Voltooid PR #34 — Claude haalde via Chrome MCP paginated alle data zelf op | 2026-05-13 |
| 57 | [Sprint 15: Vrije tekst safeguards verzuim](57-sprint-15-verzuim-tekst-safeguards.md) | ✅ Voltooid PR #39 | 2026-05-13 |
| 58 | [Sprint 16: BS2 deep walk resterende modules](58-sprint-16-resterende-modules.md) | ✅ Voltooid PR #40 | 2026-05-13 |
| 59 | [Sprint 17: Entiteiten (STRICT BS2 parity)](59-sprint-17-entiteiten-strict-parity.md) | ✅ Voltooid PR #41 | 2026-05-13 |
| 60 | [Sprint 18: Final BS1↔BS2 verification + Gebruikers tab](60-sprint-18-final-bs2-verify.md) | ✅ Voltooid PR #42 | 2026-05-13 |
| 61 | [Sprint 19: v2 eindrapport](../99-v2-eindrapport.md) | 🟡 In review (PR open) — v2 100% klaar bij merge | 2026-05-13 |
| 53 | [Sprint 11: Authenticated E2E tests](53-sprint-11-authenticated-e2e.md) | ✅ Voltooid PR #35 | 2026-05-13 |
| 54 | [Sprint 12: Per-feature regression tests](54-sprint-12-per-feature-regression.md) | ✅ Voltooid PR #36 | 2026-05-13 |
| 55 | [Sprint 13: CI integratie op release-tag (E2E)](55-sprint-13-ci-release-tag.md) | ✅ Voltooid PR #37 | 2026-05-13 |
| 56 | [Sprint 14: GDPR retention + DSR flow](56-sprint-14-gdpr-retention-dsr.md) | 🟡 In review (PR open) | 2026-05-13 |
| 62 | [v3 Fase 0.5 — errors.html admin-pagina](62-v3-errors-html-admin-pagina.md) | ⏳ TODO (deferred naar Fase E gap-fix) | 2026-05-13 |
| 63 | [Client-detail koude-direct-load (lesson #13 herhaling)](63-clientbeheer-clientdetail-coldload.md) | ✅ Opgelost PR #387/#388/#389 — 2 clean runs live | 2026-05-28 |
| 65 | [Taken-hiërarchie: mobiele app (vervolg)](65-taken-hierarchie-mobiel.md) | ✅ AF & LIVE — mobiel PR #5 (status/draad/bijlage), live getest | 2026-05-31 |
| 66 | [Taak-deadline herinneringen (dagelijks signaal + push)](66-taken-deadline-herinneringen.md) | ✅ AF & LIVE — SQL+pg_cron (08:00 NL) + pg_net/push-edge-function | 2026-05-31 |
| 67 | [ETF Triade (richting U): dashboard KPI-tegels volkleuren](67-etf-triade-dashboard-tegels.md) | ⏳ TODO — app-brede recolor is live, gevulde tegels per dashboard volgt | 2026-06-13 |

## Voor v3

Indien zelfs de index-tabel hierboven conflicten geeft: switch naar `git ls-files docs/phase4/open-items/*.md` als dynamische index (no static table). Niet nu nodig.
