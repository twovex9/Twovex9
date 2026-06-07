# Phase 4 — 08: Performance benchmarks

**Datum**: 2026-05-12
**Doel**: baseline page-load timings voor key pages, zodat we toekomstige performance-regressies en optimalisaties kunnen meten. Voltooit item 6.2 uit `06-professional-finish.md`.

## Methode

Gemeten via Chrome MCP `javascript_tool` op productie (`https://besa-suite.vercel.app`) na PR #6 merge (commit 2c787fa) met cache-busting actief. Test-browser was warm (geen cold cache), simuleert daily-use scenario.

Metrieken uit `performance.getEntriesByType('navigation')[0]`:
- **DCL** (DOMContentLoaded): tijd vanaf navigatie tot HTML+sync-scripts geparsed
- **Load** (LoadComplete): tijd vanaf navigatie tot alle resources geladen
- **DI** (DOMInteractive): tijd tot DOM bewerkbaar is (eerste user interaction mogelijk)
- **Resp** (responseTime): tijd vanaf request-send tot eind van HTML response (server tijd)
- **KB**: HTML transferSize in KB (incl. headers)
- **Rows**: zichtbare `<tr>` rijen na initial render (waar van toepassing)

## Resultaten

| Page | DCL (ms) | Load (ms) | DI (ms) | Resp (ms) | HTML KB | Rows | Records (DB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| home.html | 401 | 583 | 400 | 186 | 2 | — | — |
| planning.html | 316 | 498 | 311 | 232 | 6 | grid* | 4461 |
| audit.html | 477 | 667 | 475 | 209 | 3 | 30 | 6000+ |
| clienten.html | 512 | 734 | 342 | 256 | 5 | 50 | 93 |
| beschikkingen.html | 641 | 814 | 302 | 221 | 6 | 15 | 251 |
| facturen.html | 944 | 1312 | 392 | 290 | 6 | — | 990 |
| index.html (medewerkers) | 1086 | 1311 | 953 | 264 | 6 | 102 | 103 |

*planning.html gebruikt grid-view (28 cellen visible per week), niet table-tr.

## Analyse

### Wat goed gaat

- **Server response (HTML)**: 186-290ms over alle pages — Vercel edge response is consistent en snel.
- **HTML transferSize**: 2-6 KB per page — minimal payload, Cache-Control headers van PR #1 werken (browser hergebruikt JS/CSS uit cache).
- **DOMInteractive < 1s** voor 5 van 7 pages. Bij medewerkers iets langer (953ms) door 102 rows initial render.
- **Full LoadComplete < 1.5s** voor alle 7 pages.
- **planning.html ondanks 4461 records** laadt het snelst (498ms) dankzij grid-view die niet alle records tegelijk rendert.

### Bottleneck-analyse

- **index.html (medewerkers)** is langzaamst op DCL (1086ms) en DI (953ms). Oorzaak: 102 rijen direct rendered in `<table>`. Bij groei naar 1000+ medewerkers wordt dit een issue.
- **facturen.html** Load (1312ms) is langzaam ondanks slechts ~990 records — geen visible rows gemeten suggereert lazy-render is actief, maar full load duurt nog steeds. Mogelijk async fetches buiten `loadEvent`.

### Risico's bij groei

| Tabel | Huidig | Bottleneck bij | Reden |
|---|---:|---:|---|
| planning | 4461 records | 50000 | Grid kan veel hanteren; data-fetch via `chunked` range query |
| facturen | 990 records | 5000 | Initial fetch wordt zwaar zonder pagination |
| medewerkers (index) | 103 actief | 1000 | `<table>` met alle rows in DOM = slowdown bij sortering/filtering |
| clienten | 93 actief | 1000 | Idem als medewerkers |
| audit | 6000+ records | — | Al beperkt tot 500 recente events (zie open-items #8) |

## Aanbevelingen (geen acties — alleen referentie)

**Niet kritiek nu** (huidige volumes prima):
- Bij groei naar > 1000 actieve records per hoofdtabel: virtualisatie overwegen (alleen render zichtbare 50 rows + scroll-listener om meer te laden)
- Of: native HTML `<select>`-style pagination toevoegen aan `.table-footer` (per 100 of 250 rows)

**Optionele optimalisaties** (laag effort, klein voordeel):
- Add `loading="lazy"` aan avatar-images in tabellen (niet alle pages hebben dit)
- Preload kritieke API-calls via `<link rel="preconnect" href="https://ukjflilnhigozfoxowmj.supabase.co">` in `<head>` — bespaart 50-100ms DNS+TLS handshake

## Volgende meting

Herhaal deze benchmarks elke ~6 maanden of na grote feature-additions. Vergelijk tegen deze baseline om regressies te detecteren.

**Reproduceerbaar via**:
```javascript
// In browser console na navigeren naar X.html
(()=>{ const n=performance.getEntriesByType('navigation')[0]; return JSON.stringify({dcl:Math.round(n.domContentLoadedEventEnd-n.startTime),load:Math.round(n.loadEventEnd-n.startTime),di:Math.round(n.domInteractive-n.startTime),resp:Math.round(n.responseEnd-n.requestStart),size_kb:Math.round(n.transferSize/1024)}); })()
```
