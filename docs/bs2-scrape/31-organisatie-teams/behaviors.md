# Module 31 — Organisatie / Teams — BEHAVIORS

## Search & filters
- Zoeken (`#teams-search`): live filter
- Gearchiveerd-toggle (`.switch--yellow`): tussen actieve en gearchiveerde teams

## Pagination
- Rijen per pagina: 10/15/30/50 (default 30)
- First/Prev/Next/Last via «/‹/›/»

## Add/Edit modal (`teams-add-modal`)
- `+ Team toevoegen` → opens add-modal
- Klik op team-naam → opens edit-modal pre-populated
- Velden: naam (required) / beschrijving / teamleider-select / locatie-select
- Submit → `teamsDB.add(payload)` of `.update(id, payload)`

## Members modal (`teams-members-modal`)
- Klik op "Leden beheren"-button → opens members modal
- Add member: medewerker-select + rol-input → Toevoegen
- Remove member: trash-icon per row
- Set role: dropdown per member

## Archive flow (`teams-archive-modal`)
- Klik trash-icoon op actieve row → slider-modal
- Slider 0→100% → confirm enabled
- Confirm → `teamsDB.archive(id)`

## Restore flow (direct, geen modal)
- Klik Herstel-button bij gearchiveerd team → direct restore

## Purge flow (`teams-purge-modal`)
- Klik trash-icoon op gearchiveerd team → slider-modal
- Slider 0→100% → confirm enabled
- Confirm → `teamsDB.delete(id)` (en cascade medewerker_teams rijen)

## Modal close-ways (na Bug #66 fix)
- X-button: alle 4 modals
- Cancel-button: alle 4 modals
- **Escape**: globale handler (Bug #66 fix)
- **Overlay-click**: per-modal handler (Bug #66 fix)
- 12/12 close-ways werkend ✅

## Events
- `ff:teams-updated` → re-render
- `ff:medewerkers-updated` → re-render (cascade)
- `ff:locaties-updated` → re-render (cascade)
