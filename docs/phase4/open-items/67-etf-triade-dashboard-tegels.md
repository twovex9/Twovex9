# 67 — ETF Triade (richting U): dashboard KPI-tegels volkleuren

**Status:** ✅ Gedaan voor de neutrale KPI-rijen (PR volgt). Semantisch-gekleurde
rijen blijven bewust ongemoeid (zie hieronder).
**Datum:** 2026-06-13
**Context:** Website-redesign brainstorm → gekozen richting **U (ETF Triade)**.

## Uitgevoerd (2026-06-13)

De gevulde merk-tegels (blauw → lime → mint) zijn toegepast op de **gedeelde
neutrale KPI-rijen** via `:nth-child`-cycling in `styles.css` — geen HTML-/JS-
wijziging nodig:

- `.md-quickstats > .md-qstat` → management-, hr-, compliance- en planner-dashboard
- `.bz-kpis > .bz-kpi` → bezetting
- `.mob-kpis:not(.mob-kpis--controle) > .mob-kpi:not(.mob-kpi--link)` → mobiliteit
  (de klikbare controle-tegels houden hun hover-gedrag)

Tekstkleur volgt per vulkleur (wit op blauw, donker op lime/mint) via
`--tile-fg`/`--tile-fg-muted`; werkt in light én dark (blauw wordt in dark
iets dieper voor leesbaarheid). Geverifieerd met een render van de echte
classes + `styles.css` (light + dark).

**Bewust NIET ingekleurd** (houden hun betekenis-kleur):
- `.bd-money` (geld: rood=openstaand, oranje=wacht, groen=betaald)
- `.id-kpi` (incidenten: per-status kleuren)
- `.md-metric` en `.cmd-kpi` (semantische rood/oranje/groen op de waarde)

### Eventueel later
- JS-gegenereerde rijen `.cmd-kpis` en `.md-metric-grid` dragen al semantische
  kleuren; alleen als de gebruiker daar óók de triade wil, kan dat per JS-template.

## Wat is al gedaan

App-brede recolor doorgevoerd via een `:root`-token-swap in `styles.css` (light + dark):
- Koelere canvas (`--bg-muted: #eef1f4`) zodat witte kaarten zweven.
- Zachtere tekst (`--text: #1f3140`) i.p.v. puur zwart.
- ETF logo-blauw als huiskleur (`--blue: #3a8fc4`), lime (`--green`) en mint
  (`--mintc`/`--mint-soft`) in pills/sidebar.
- Witte sidebar met mint-getint actief item (`--sidebar-active: #e0efe9`).
- Zachte kaartschaduw (`--shadow-card`) op `.table-card`.
- Nieuwe losse merk-tokens: `--etf-blue`, `--etf-lime`, `--etf-mint`
  (+ `*-deep`), beschikbaar voor tegels/accenten.
- Dark-thema bijgewerkt naar **ETF Dark (richting V)**.

## Wat nog open is

De "signature" van richting U — de **vol ingekleurde stat-tegels** (blauw /
lime / mint) zoals in de goedgekeurde preview — is nog niet per dashboard
toegepast. Reden: er is geen één gedeelde stat-card class; er zijn ~191
varianten met eigen prefixes (`hd-card`, `amp-…`, dashboard-specifiek). Blind
alle selectors volkleuren is risicovol (tekstcontrast op gevulde tegels vraagt
per geval aandacht).

## Voorgestelde oplossing

1. Eén herbruikbare utility introduceren in `styles.css`:
   `.etf-tile` + modifiers `.etf-tile--blue` / `--lime` / `--mint` / `--plain`
   met correcte tekstkleur-contrasten (zoals in de preview
   `preview-U-detail.html`).
2. Per dashboard (Medewerkers, HR-dashboard, management-dashboard,
   mobiliteit-, compliance-, planner-dashboard, …) de bestaande KPI-rij
   omzetten naar `.etf-tile`-varianten — **zonder** iets te verplaatsen,
   alleen class + (waar nodig) minimale markup-wrap.
3. Per dashboard 2 clean runs (visueel + functioneel) conform hardcore-instructie.

## Vereisten

- Per dashboard een aparte feature-branch + PR (klein, reviewbaar).
- Contrast-check op elke gevulde tegel (WCAG: lime-tegel = donkere tekst,
  blauw-tegel = witte tekst, mint-tegel = donkergroene tekst).
- Dark-mode variant meenemen (tegels iets gedempter, tekst licht).

## Referentie

- Goedgekeurde preview: `preview-U-detail.html` (lokaal aangeleverd in de chat).
- Token-basis: `:root` in `styles.css` (zoekтерm `ETF TRIADE`).
