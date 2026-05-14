# Module 33 — Instellingen / Entiteiten — BEHAVIORS

## Render flow
- `renderEntiteiten()` in instellingen.js (regel 305-338)
- Filter `ENTITEITEN_LIST` hardcoded array op search-query
- Render 7 rows met monospace `<code>` voor naam-cell
- Async load record-counts via `getEntCount(bs1_table)`

## Search
- Live filter on input
- Searches: naam + beschrijving (case-insensitive)
- **Bug #67 fix**: empty-state placeholder bij 0 results

## Kolommen-kiezer
- 2 toggleable (Beschrijving, Aantal records)
- Naam = skipToggle=true (altijd zichtbaar)
- Voorkeuren in localStorage `inst_entiteiten_columns_v1`
- TD + TH beide hebben `data-col` → toggle hide werkt op beide ✅

## Aantal-records async load
- Bij render: tonen "laden…" placeholder voor entities met bs1_table
- Async fetch `getEntCount(table)` → vervang met `<strong>X</strong>`
- Fallback bij error: `<span style="color:var(--red)">?</span>`
- Entities zonder bs1_table: "—" placeholder

## Geen modals
- Read-only viewer, geen CRUD-flows
- Geen Add/Edit/Delete buttons
- Geen archive-toggle
