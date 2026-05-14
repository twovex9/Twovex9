# Module 22 — Incidenten — BEHAVIORS

## Tab-switch
- "Mijn cliënten" → filtert op huidige medewerker's cliënten
- "Alle incidenten" (default active) → toont alle records

## Search + filters
- Live filter via `#inc-search`
- Dropdown-filters: Status / Locatie / Medewerker / Categorie / Cliënt
- Date-range filter: `#inc-filter-datum-van` t/m `#inc-filter-datum-tot`
- Gearchiveerd-toggle: `#inc-archived-toggle`

## Incident-melden flow
1. Klik `#inc-add-open-btn` → navigeer naar `incident-melden.html`
2. Vul form: Cliënt / Tijd-plaats / Categorie / Omschrijving / Maatregelen / Bijlages
3. Klik "Nieuwe incident melding" (`#im-submit`) → INSERT in `public.incidenten`
4. Redirect terug naar overzicht

## Bewerken
- Klik op rij/Afhandelen → `incident-melden.html?id=X` (edit mode)

## Archive-flow
- `#inc-archive-modal` met slider-confirm
- Per row trash → archive

## Purge-flow
- `#inc-purge-modal` met slider-confirm (alleen archived)

## Status display
- Storage: snake_case (in_afwachting / in_behandeling / opgelost)
- Display: proper case ("In afwachting" / "In behandeling" / "Opgelost")
- Toggle via dropdown options text

## Stats
- 3 stat-counters: aantal per status
