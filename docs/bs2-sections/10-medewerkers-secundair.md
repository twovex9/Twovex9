# BS2 — Medewerkers secundaire nav (`/main-employee`)

**URL**: https://etf.acceptance.besasuite.nl/main-employee

⚠️ **Capture leek leeg** — alleen top-nav, geen page-content zichtbaar.

## Hypothesen
1. Page laadde nog niet volledig op moment van capture (Vue async render)
2. Pagina is role-gated (huidige rol heeft geen toegang)
3. URL is daadwerkelijk redirect-only (zonder eigen UI)
4. Mogelijk een ander concept dan de HR-medewerkers (bv. "Mijn profiel als medewerker"?)

## Volgende stap (Phase 2)
- Opnieuw bezoeken, wachten op render, dan capture
- DevTools network bekijken op deze URL voor API calls die hint geven aan content
- Mogelijk eerst andere user-rol activeren om te zien wat erachter zit
