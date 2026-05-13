# Module 02: Planning — DOM structure

**BS2-URL**: `https://etf.acceptance.besasuite.nl/planning/overview`
**Sub-pages**: `/planning/management` (Beheer, niet gescraped in batch 1)
**BS1-equivalent**: `planning.html`
**Rol-context bij scrape**: admin
**Gescraped op**: 2026-05-13 (batch 1, hardcore Pass 1)
**Pass-status**: batch 1 = topbar/sidebar/KPI/+Dienst-modal/Genereren-wizard/Optimaliseren-wizard/Week↔Maand getest. Filter-radios/dropdowns/cells/KPI-klik/Lijst-view in batch 2.

## Top-level layout

```
+----------------------------------------------------------+
| Topbar (global)                                          |
+--------+-------------------------------------------------+
|        | Toolbar (Locatie / Datum / View / Acties)       |
|        +-------------------------------------------------+
|        | KPI cards (5)                                   |
| Side-  +-------------------------------------------------+
| bar    | Days header (7 dagen)                           |
| filters| Group: Openstaande diensten (N) + per-day diensten
|        | Group: Achterwacht (7) + per-day diensten       |
|        | Group: Breedstraat (35) + per-day diensten      |
|        | Group: Leonard Bramerstraat (7)                 |
|        | Group: Varnebroek (39)                          |
|        | ... (interne scroll-container voor meer groepen)|
+--------+-------------------------------------------------+
```

## Sidebar (links, sticky)

### Filter Voorinstellingen sectie
- H3: "Filter Voorinstellingen"
- Refresh-icoon (circulaire pijl)
- "+ Nieuwe voorinstelling maken" knop met "+" icoon
- Lijst van opgeslagen voorinstellingen (niet zichtbaar bij start, mogelijk leeg of gevuld per user)

### Aangepaste Filters sectie
- H3: "Aangepaste Filters"
- **Diensttype** dropdown (placeholder "Selecteer")
- **Toewijzingsstatus** radio-group (single-select):
  - Toegewezen
  - Niet toegewezen
  - Vervanging vereist
  - Alle (default geselect)
- **Dienstverband** radio-group:
  - Inhuur
  - Loondienst
  - Inhuur en Loondienst (default geselect)
- **Teamlid** dropdown ("Selecteer een teamlid")
- **Cliënt** dropdown ("Selecteer Cliënt")

### Footer
- **Exporteren** knop (met download-icoon)
- **Filters wissen** knop onderaan (sticky)

## Toolbar (boven KPI-cards)

Van links naar rechts:
1. **Selecteer Locatie** dropdown (filter)
2. **Vandaag** knop (jump naar huidige week/maand)
3. Datum-picker (kalender-icoon)
4. Prev-pijl (vorige week/maand)
5. Next-pijl (volgende week/maand)
6. **Week-titel** (centered, bv. "Week 20 May 2026" of in Maand-view "May 2026")
7. **View-toggle**: Raster / Lijst (radio-button-style)
8. **Periode-toggle**: Week / Maand (radio-button-style)
9. **Genereren** knop (geel/wit, met AI-spark-icoon)
10. **Optimaliseren** knop (groen, primary-style)
11. **+ Dienst aanmaken** knop (donker/zwart, primary)

## KPI-cards (5 stuks, horizontale strip onder toolbar)

| KPI | Icoon | Voorbeeld-waarde (week) | In Maand-view |
|---|---|---|---|
| **ZZP Kosten** | € | € 70.716,75 | leeg |
| **Geplande uren** | klok | 1809u | leeg |
| **Openstaande uren** | klok | 32u | leeg |
| **Kilometerkosten** | € | € 200,69 | leeg |
| **Gem. tarief** | € | € 47,16 | leeg |

→ KPI-cards reset/leeg in Maand-view. Mogelijk alleen Week-view aggregeert.

## Week-view (default)

### Days header
- 7 kolommen: ma 11 / di 12 / wo 13 (today, onderlijnd blauw) / do 14 / vr 15 / za 16 / zo 17
- Datum-getal in groot, dag-naam in klein

### Per group-row
Group-header (sticky links?):
- Icoon (pin/locatie)
- Group-naam (bv. "Achterwacht")
- Aantal-badge (bv. "7")
- ZZP-aggregaat (€ 418,75)
- Geplande uren (8u 45m)
- Openstaande uren (32u)
- KM (€ 0,00)
- Gem. tarief (€ 47,86 /u)

Per day-cell (7 kolommen):
- Per dienst een card-blok met:
  - Dienst-type (Achterwacht / Vroege dienst / Late dienst / Waakdienst / Dano 1 op 1 / Kim 1 op 1 / Romano 1 op 1 / Destiny 1 op 1)
  - Tijd-range (17:00 - 09:00)
  - Locatie (pin-icoon + naam, bv. "Breedstraat")
  - Tarief (bv. ¥14.75u)
  - Duur (1u 15m)
  - Medewerker (avatar-circle + naam)
  - Status-dot (kleur: groen/rood/blauw — toegewezen/openstaand/vervanging?)
  - Rode achtergrond op cell = vervanging vereist? (te bevestigen in batch 2)
- Onder de day-cell: medewerker-avatar-badges (RO, HE, JR, DB, +N voor extra)

### Specifieke gevonden groepen (in Week 20 May 2026)
- Openstaande diensten (2)
- Achterwacht (7)
- Breedstraat (35)
- Leonard Bramerstraat (7)
- Varnebroek (39)
- (interne scroll-container — vermoedelijk meer onder Varnebroek)

## Maand-view (toggle "Maand")

- Header: maand-titel (bv. "May 2026")
- 5 weken zichtbaar (W18-W22)
- Per dag-cel:
  - Datum-getal links
  - Aantal-badge rechtsboven (bv. "34", "33", "35")
  - Lijst van dienst-types als getemd-tekst regels met kleur-dot (bv. "Achterwacht", "Vroege dienst", "Late dienst")
  - **"See all..."** link onderaan om alle diensten van die dag te zien
- Vandaag-dag heeft accent (blauwe achtergrond + bullet)
- Lege dagen tonen alleen datum

## Lijst-view (toggle "Lijst") — NIET GETEST IN BATCH 1

Te scrapen in batch 2: vermoedelijk tabel-weergave alle diensten met sortering/filtering.

## Pagination / loading

- **Interne scroll-container** voor de groepen-lijst (page-height bleef 1010, scroll niet via window.scrollY)
- Geen klassieke pagination
- Lazy-load mogelijk bij scroll-end (te testen in batch 2)

## Lege-state — NIET GETEST IN BATCH 1

Wat toont BS2 bij week zonder diensten? Vermoedelijk lege grid met KPI=0. Te testen via navigation naar verre week.

## Toolbar-knoppen scrape resultaten

### + Dienst aanmaken — modal-detail (batch 1 getest)

Slide-in panel rechtsboven met form-velden:

| Veld | Type | Verplicht | Default |
|---|---|---|---|
| Diensttype | dropdown | ✅ | leeg |
| Locatie | dropdown | ✅ | leeg |
| Starttijd | date + time | — | vandaag + nu |
| Eindtijd | date + time | — | vandaag + nu+1u |
| Pauze (uren) | number | — | 0 |
| Vereist aantal medewerkers | number | — | 1 |
| Medewerkers | dropdown | — | leeg "Selecteer een teamlid" |
| Cliënt | dropdown | — | leeg "Selecteer Cliënt" |
| Vereiste competenties | dropdown | — | leeg "Selecteer Competenties" |
| Beschrijving | rich-text editor | — | leeg |

Rich-text editor toolbar: **B / I / S / U / H1 / H2 / bullet-list / numbered-list** (8 formatters)

Onder form: **Herhaling** sectie met "Herhaal dienst" toggle-switch (uit default)

Footer-knoppen: **Annuleren** (outline) + **Toevoegen** (primary, dark)

### Genereren — AI Planning Wizard (batch 1 getest)

Full-screen overlay (links boven: "AI Planning · Selecteer sjabloon")

**5-stappen wizard** (breadcrumbs):
1. Selecteer sjabloon (active)
2. Configureer sjabloon
3. Planning genereren
4. Planning beoordelen
5. Toepassen

**Stap 1 = 2 panels naast elkaar**:

**Linker-panel: Beschikbare sjablonen**
- Kolommen-kiezer
- "+ Nieuw sjabloon maken" knop (blauw)
- Zoek-input
- Tabel-kolommen: Naam sjabloon (sortable) / Beschrijving (sortable) / Aangemaakt op (sortable)
- Radio-button per rij (single-select)
- Gevonden 20 sjablonen (15 per pagina, 2 pagina's)
- Voorbeelden: TUSSENDIENST MAIK, Achterwacht, Breedstraat, Ochtenddienst Breedstraat, Avonddienst Breedstraat, 2, Magdalenen, Dagdienst Leonard B., Avonddienst, Dagdienst, Dorpstraat - Avond dienst, 1 op 1 - Magdalenenstraat, Dorpstraat juni, 1op1, rooster 1 op 1

**Rechter-panel: Conceptroosters**
- Kolommen-kiezer
- Zoek-input
- Tabel-kolommen: Generation / Periode (sortable) / Aantal diensten (sortable) / Aangemaakt op (sortable)
- 23 conceptroosters (15 per pagina)
- Per row een periode + counts

**Footer**: "Volgende" knop (disabled tot sjabloon geselect)

**Close X** rechtsboven sluit hele wizard.

→ BS1-implicatie: dit is een MAJOR feature. Implementeert AI-template-based planning generator. Voor v3 strikte infra-regel (geen externe AI) → rule-based via Supabase Edge Function of via SQL `pg_cron` job.

### Optimaliseren — AI Optimizer (batch 1 getest)

Full-screen overlay (links boven: "AI · Planning optimaliseren")

**2-stappen wizard** (breadcrumbs):
1. Configureren (active)
2. Controleren

**Stap 1 = single panel centered**:
- Icoon (toverstaf)
- H2: "Planning optimaliseren"
- Beschrijving: "Selecteer een periode en een locatie, de AI zal automatisch de beste medewerkers toewijzen op basis van beschikbaarheid, competenties en voorkeuren."
- Velden:
  - **Startdatum** (date, default 15-05-2026 = volgende week zaterdag?)
  - **Einddatum** (date, default 17-05-2026)
  - **Locatie** (dropdown "Selecteer een locatie")
  - **Medewerkers** segmented control: Alle (default) / Loondienst / Inhuur
- **"Optimaliseren met AI"** knop (disabled tot locatie geselect)

**Close X** rechtsboven.

→ BS1-implicatie: rule-based optimizer via Supabase Edge Function. Aanwezigheid + competenties + voorkeuren als input.

## Sub-route /planning/management

**NIET GESCRAPED IN BATCH 1**. Te doen batch 2 of Module 02-B.

## Te scrapen in batch 2 (hardcore-discipline)

1. Klik elke filter-radio (Toegewezen / Niet toegewezen / Vervanging vereist) → impact op grid
2. Klik elke Dienstverband-radio (Inhuur / Loondienst)
3. Open Diensttype-dropdown → opties capturen
4. Open Selecteer Locatie-dropdown → opties capturen
5. Open Teamlid-dropdown → opties (lijst van medewerkers)
6. Open Cliënt-dropdown → opties
7. Open Diensttype-dropdown in +Dienst aanmaken modal
8. Open Locatie-dropdown in +Dienst aanmaken modal
9. Test rich-text editor (formatter-knoppen B/I/S/U/H1/H2/lists)
10. Test "Herhaal dienst" toggle → toont herhalings-config?
11. Klik op dienst-cell in grid → open detail-modal
12. Klik op group-header (Achterwacht etc.) → wat gebeurt?
13. Klik op KPI-card → drill-down?
14. Klik op "+N" medewerker-badge → toon alle
15. Klik Lijst-view → tabel-weergave
16. Klik Vandaag / prev / next datum-knoppen → URL/state-impact
17. Klik Exporteren-knop in sidebar → wat exporteert (CSV/Excel/PDF?)
18. Klik Filters wissen → reset alle filters
19. Klik refresh-icoon naast "Filter Voorinstellingen"
20. Klik "+ Nieuwe voorinstelling maken" → modal
21. Test sub-route `/planning/management` (Beheer)
22. Test in dropdown van Genereren-wizard: klik op een sjabloon → Volgende → stap 2-5
23. Test Optimaliseren met locatie geselect → klik "Optimaliseren met AI"
24. Hover op KPI-card → tooltip?
25. Lege state (navigeer naar verre week zonder data)
