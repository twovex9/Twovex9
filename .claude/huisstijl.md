# Huisstijl & lay-out — altijd toepassen

Pas deze regel **standaard altijd** toe op alles wat je toevoegt of wijzigt in deze app. Wijk er alléén van af als de gebruiker dit expliciet zo vraagt.

## Referentiepagina (ground truth)

`index.html` (Medewerkers) is de stijl-bron. Andere pagina's moeten visueel en structureel hetzelfde voelen: dezelfde topbar, sidebar, content-header, toolbar, tabel-kaart, knoppen, modals, toast en pagination.

## Tokens — altijd via CSS-variabelen uit `:root` in `styles.css`

- Tekst: `--text` / `--text-secondary` / `--text-muted`
- Lijnen: `--line` / `--line-strong`
- Kleuren: `--blue`, `--red`, `--green`, `--yellow` (+ `*-soft` varianten)
- Radii: `--r-xs/sm/md/lg/xl/pill` (kaarten = `--r-xl`)
- Typografie: `--font-base` (13px), `--font-table-cell` (13px), `--font-table-head` (12px), `--font-h1` (30px), `--font-ui-badge` (10px)

Geen losse `font-size`, `color: #...` of `border-radius: 12px` in nieuwe code. Gebruik de variabele of bestaande utility-class.

### ETF Triade (richting U) — de actieve huiskleuren

De interface draait op het ETF-logo-palet (blauw / lime / mint). Gebruik **altijd** deze tokens; introduceer nooit de oude kleuren opnieuw.

| Rol | Token | Light | Oud (VERBODEN) |
|---|---|---|---|
| Huiskleur / primair | `--blue` | `#3a8fc4` | ~~`#2563eb`~~ / ~~`rgba(37,99,235,*)`~~ |
| Succes / actief | `--green` | `#5f8a23` (lime) | ~~`#16a34a`~~ / ~~`rgba(22,163,74,*)`~~ |
| Waarschuwing | `--yellow` | `#c2830d` | ~~`#ca8a04`~~ / ~~`rgba(202,138,4,*)`~~ |
| Fout / gevaar | `--red` | `#cf4b3a` | ~~`#dc2626`~~ / ~~`rgba(220,38,38,*)`~~ |
| Zachte tint (achtergrond) | `--*-soft` | — | losse `rgba(<oud>,*)` |
| Merk-tegels/accenten | `--etf-blue` / `--etf-lime` / `--etf-mint` (+ `*-deep`) | logo | — |

Dark mode (`[data-theme="dark"]`) = ETF Dark (richting V); de tokens kantelen automatisch mee, dus code die tokens gebruikt klopt in beide thema's.

**CI bewaakt dit**: de stap *"House-style color consistency"* in `.github/workflows/ci.yml` laat de build **falen** zodra een oude palet-kleur (hex of rgba) in `*.css`/`*.html`/`*.js` belandt. Nieuwe code blijft zo vanzelf consistent.

Gevulde KPI-tegels op dashboards: zie de `.md-quickstats` / `.bz-kpis` / `.mob-kpis` regels in `styles.css` (zoekterm `ETF TRIADE`) — neutrale KPI-rijen krijgen automatisch blauw → lime → mint via `:nth-child`.

## Verplichte component-classes (her-)gebruiken

| Onderdeel | Class | Mag NIET vervangen worden door |
|---|---|---|
| Topbar | `.topbar` + `.top-link` (+ `.top-link--dropdown`) | eigen header |
| Sidebar | `.sidebar` / `.side-link` / `.side-link--sub` / `.side-link--nested` | eigen nav |
| Content-titel | `.content-header` met `<h1>` (gebruikt `--font-h1`) | losse `<h1>` |
| Toolbar boven tabel | `.toolbar` met `.search`, `.switch`, `.filter-chips` | eigen wrapper |
| Tabel | `<section class="table-card"> <div class="table-wrapper"> <table class="employees-table">` | losse table layouts |
| Primaire knop | `.btn-primary` (blauw, `+ Iets toevoegen`) | eigen kleur |
| Secundaire knop | `.btn-outline` | eigen variant |
| Modal | `.modal-overlay` + `.modal-card` + `.modal-header` | eigen overlay |
| Toast | reuse bestaande `showToast`/`.app-toast` | `alert()` of eigen popup |

## Acties in een rij (vuilbak / herstellen)

Gebruik altijd hetzelfde patroon, ook in nieuwe lijsten:

```html
<td data-col="acties" class="…-actions-cell">
  <!-- normale weergave -->
  <button class="employee-delete-btn …-archive-btn" aria-label="Archiveren">[TRASH SVG]</button>

  <!-- gearchiveerde weergave -->
  <div class="hr-row-actions">
    <button class="btn-outline hr-restore-btn">Herstel</button>
    <button class="employee-delete-btn …-purge-btn" aria-label="Definitief verwijderen">[TRASH SVG]</button>
  </div>
</td>
```

Trash-icoon is altijd dezelfde 24×24 outline SVG (`stroke-width="2"`, paths `M3 6h18 / M19 6v14… / m3 0V4…`). Niet vervangen door een ander icoon of emoji.

## Layout-shell (elke gewone pagina)

```html
<body>
  <div class="app-shell">
    <header class="topbar">…dezelfde topbar als index.html…</header>
    <aside class="sidebar">…sectie-zijbalk…</aside>
    <main class="content">
      <div class="content-header"><h1>…</h1><div class="header-actions">…</div></div>
      <div class="toolbar">…</div>
      <section class="table-card"><div class="table-wrapper"><table class="employees-table">…</table></div></section>
    </main>
  </div>
  <link rel="stylesheet" href="styles.css">
</body>
```

Gebruik **geen** inline `<style>`-blok in HTML. Voeg page-specifieke CSS toe in `styles.css` onder een duidelijk gelabeld kopje, en hergebruik bestaande variabelen/classes.

## Fasen (cliënt- en beschikkingfase)

- Elke fase heeft een vaste kleur: pills (`.cl-fase-pill--*`, `.cd-besc-fase--*`), stippen (`.bdtl-fase-dot--fase-*`, `client-detail-sdot--fase-*`) — alleen in `styles.css` met bestaande tokens.
- Logica fase-waarde → class: `fase-ui.js` (`besaFaseClientPillClass`, `besaFaseClientSdotClass`, `besaFaseBescDotClass`). Nieuwe plekken met fase: script `fase-ui.js` inladen vóór de pagina-JS en deze functies gebruiken (geen losse duplicaat-mappings).

## Vaste do's

- Nieuwe pagina = kopiëren van `index.html` als skelet, daarna inhoud aanpassen.
- Nieuwe modal = kopie van een bestaande `.modal-overlay` (bv. `#cl-purge-modal`), niet from scratch.
- Knop met "+" voor toevoegen = `.btn-primary` met label `+ X toevoegen`.
- Archief-toggle = `.switch.switch--yellow` met label "Gearchiveerd".
- "Vereist actie"-toggle = `.switch.switch--red`.
- Pagination/footer = `.table-footer` zoals in `index.html`.
- **Datum-/periodekeuze = ALTIJD `window.BesaDateRange` (`besa-daterange.js`)** — de herbruikbare BS1-huisstijl range-kalender (gestileerde pill + dubbele-maand popover + preset-dropdown, NL-labels). Patroon: container-`<div>` + twee `<input type="hidden">` (ISO yyyy-mm-dd) als bron van waarheid; component dispatcht `change` op die inputs zodat bestaande paginalogica blijft werken. Mount: `window.BesaDateRange.mount({container,startInput,endInput,allowEmpty,emptyLabel,year})`. Laad `besa-daterange.js` vóór de page-JS. Referentie-implementaties: `beschikkingen-dashboard`, `facturen`, `incidenten-dashboard`. **Nooit** losse native `<input type="date">` in een toolbar/header/filterbalk gebruiken — die zijn niet onze huisstijl. Quick-preset-knopjes naast de pill mogen, maar moeten na keuze de pill syncen via `widget.setRange(start,end)`.

## Vaste don'ts

- Geen extra fontsizes (12px, 14px, 16px, 18px) buiten de `--font-*` tokens.
- Geen eigen kleuren-hex, gebruik tokens.
- Geen `border-radius` magic numbers, gebruik `--r-*` tokens.
- Geen eigen knopvarianten met andere padding/hoogte dan `.btn-primary` / `.btn-outline`.
- Geen tweede trash-icoon (geen 🗑️, geen filled bin, geen ander SVG-pad).
- Geen losse `<h1>` zonder `.content-header`-wrapper.

## Checklist vóór je een edit afsluit

- [ ] Hergebruikt bestaande classes (geen duplicaat-CSS).
- [ ] Geen inline styles of harde hex/px-waarden voor kleur, radius, font-size.
- [ ] Topbar + sidebar + content-header zijn identiek aan `index.html`.
- [ ] Trash-icoon en knoppen zijn dezelfde als elders.
- [ ] Modals gebruiken `.modal-overlay` + slider-bevestigingspatroon waar het om destructieve acties gaat.

Als de gebruiker iets vraagt dat afwijkt van deze regel, vraag eerst expliciet bevestiging vóór je afwijkt.
