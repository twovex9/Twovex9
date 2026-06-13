# Module 20 — Uren budgetering — BEHAVIORS

## Client selectie
- `#ub-sel-client` → kies cliënt
- Default: lege state met banner "Selecteer een cliënt om verder te gaan"
- Na client select: tabel toont editable cells per week

## Jaar selectie
- `#ub-sel-year` → 2024 / 2025 / 2026
- Default: huidige jaar

## Tabel
- 52 weken (week 1 t/m 52)
- Per week: Standaard uren (editable input)
- Date range per week (bv. "Dec 29, 2025 - Jan 4, 2026")

## Bulk bewerken (BS1 superset)
- `#ub-bulk-start` → activeer bulk-bewerken modus
- `#ub-bulk-exit` → verlaat bulk-bewerken
- Bulk-mode laat meerdere weken tegelijk bewerken (BS1 extra feature)

## Kolommen
- `#ub-columns-menu-btn` → toggle Weken/Standaard uren visibility

## Save
- Cell-edit op blur → INSERT/UPDATE in `public.uren_budget`
- `setCell(clientId, jaar, week, uren)` helper

## Events
- `ff:uren-budget-updated` event op window
