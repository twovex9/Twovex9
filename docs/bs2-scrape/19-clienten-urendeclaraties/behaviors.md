# Module 19 — Urendeclaraties — BEHAVIORS

## Filter-flow

- **Jaar select** (`#ud-sel-jaar`): 2024 / 2025 / 2026
- **Maand select** (`#ud-sel-maand`): Alle maanden / Jan / ... / Dec
- **Zorgsoort select** (`#ud-sel-zorg`): Alle / WIZ / Ambulant (data-driven)
- **Search** (`#ud-search`): live filter op zichtbare tekst
- **Reset-knop** (`#ud-reset`): wist alle filters

## Maand vergrendelen

- Klik `#ud-lock-btn` → vergrendelt huidige maand voor verdere edits
- Geen modal — directe actie
- BS2 zelfde gedrag

## Kolommen

- Klik `#ud-cols-btn` → floating panel met 6 toggles per kolom

## Display

- Header stats real-time: "X u Y m — Uren te declareren" + "€ Z,ZZ — Te declareren periode"
- Stats updaten bij filter-change

## Schema sync

- `ff:urendeclaraties-updated` event op window
- Schrijven naar Supabase via PostgREST
