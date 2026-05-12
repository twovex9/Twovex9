# Item 30 — Performance benchmarks baseline

**Datum**: 2026-05-12
**Status**: ✅ Voltooid
**Gerelateerd**: Item 6.2 uit `../06-professional-finish.md`, volledig rapport in `../08-performance-benchmarks.md`

Baseline page-load timings gemeten voor 7 key pages na PR #1 (cache-busting) actief in productie.

## Kort

- 7 key pages gemeten via Chrome MCP `performance.getEntriesByType('navigation')[0]`
- Server response (HTML): 186-290ms — consistent + snel
- DOMInteractive < 1s voor 5 van 7 pages
- Full LoadComplete < 1.5s voor alle 7 pages
- Cache-Control headers werken correct (HTML transferSize: 2-6 KB per page)

## Langzaamste pages

- `index.html` (medewerkers): 1086ms DCL / 953ms DI — door 102 rijen direct rendered in `<table>`
- `facturen.html`: 1312ms Load — mogelijk async fetches buiten `loadEvent`

## Aanbevelingen voor groei

Niet kritiek nu (huidige volumes prima):
- Bij > 1000 actieve records per hoofdtabel: virtualisatie of pagination overwegen
- Preconnect `<link rel="preconnect" href="https://boscwvojcggkbdxhlfys.supabase.co">` kan 50-100ms DNS+TLS besparen

## Volgende meting

Herhaal benchmarks elke ~6 maanden of na grote feature-additions om regressies te detecteren. Volledig rapport + reproduceerbare JS-snippet in [`../08-performance-benchmarks.md`](../08-performance-benchmarks.md).

**Item 6.2 uit 06-professional-finish gesloten.**
