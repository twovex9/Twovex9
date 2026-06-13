# Module 26 — Taken — BEHAVIORS

## Tab switch
- `#taken-tab-mine` / `#taken-tab-all`
- Filter records op huidige user (mine) vs all

## Add-flow
- Klik `+ Taak toevoegen` → `#taken-add-modal` opent (style.display=flex)
- Form: naam / beschrijving / toegewezenAan / status / prioriteit / deadline
- Submit → INSERT in `public.taken`
- Close (na Bug #59): X / Escape / Overlay alle 3 ✅

## Archive-flow
- Trash-icon op rij → `#taken-archive-modal` (slider)
- Close: X / Escape / Overlay ✅ (na Bug #59)

## Purge-flow
- Archived rij trash → `#taken-purge-modal` (slider)
- Close: X / Escape / Overlay ✅ (na Bug #59)

## Filters
- Search (#taken-search)
- 4 dropdowns: Status / Prioriteit / Teamlid / 2 date pickers (Deadline, Aanmaakdatum)
- 2 toggles: Gearchiveerd, Voltooide verbergen
- Reset-knop wist alles

## Events
- `ff:taken-updated` event
- `ff:medewerkers-updated` re-vult Teamlid-filter
