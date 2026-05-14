# Module 27 — Medewerker-detail — BEHAVIORS

## Tab switch
- 7 tabs: Details / Professioneel / Opleiding / Notities / Documenten / Verzuim / Verlof
- Klik tab → render gerelateerde sectie, andere tabs hidden

## Save flow (per sectie)
- Form-velden inputten → "Wijzigingen opslaan" button per sectie
- Submit → UPDATE in `public.medewerkers.data` jsonb

## Modals
- `emp-doc-modal`: document toevoegen/bewerken (form: naam/type/vervaldatum/file)
- `emp-doc-delete-modal`: document definitief verwijderen
- `emp-verzuim-modal`: verzuim-periode toevoegen/bewerken
- `emp-verlof-overd-modal`: verlofsaldo overgedragen uren wijzigen

All 4 modals (na Bug #61 fix): X / Escape / Overlay close-ways ✅

## Sidebar acties
- "Inloggen als Medewerker" (admin-functie)
- Planningstatus toggle
- "Vrijgeven voor planning" status

## Events
- `besa:medewerker-updated` event op window
- `besa:medewerkers-updated` voor cross-page sync
