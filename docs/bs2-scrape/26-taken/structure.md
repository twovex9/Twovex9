# Module 26 — Taken — STRUCTURE

**BS2 URL**: `/tasks/list`
**BS1 URL**: `https://besa-suite.vercel.app/taken.html`
**Scrape datum**: 2026-05-14

## BS2 page
- title: "Taken | Embrace The Future"
- h1: **Taken**
- 2 tabs: "Mijn taken" (default active) / "Alle taken"
- Default empty state, deadline-grouped view

## BS2 toolbar
- "Voltooide taken verbergen" toggle
- + Taak toevoegen (primary)
- Search "Search tasks..."
- "Selecteer een teamlid" dropdown
- Gearchiveerd toggle
- + Status filter
- + Prioriteit filter
- Sorteren op
- Kies een deadline (date picker)
- Kies een aanmaakdatum (date picker)
- Reset

## BS2 grouped view (deadline-based)
- Vandaag (0)
- Te laat (0)
- Deze week (0)
- Later (0)
- Geen deadline (0)

6 cols: Taaknaam / Toegewezen aan / Aangemaakt door / Status / Deadline / Prioriteit

## BS1 mirror
- h1 "Taken" ✅
- 2 tabs `#taken-tab-mine` + `#taken-tab-all`
- 8 cols (BS1 superset, + Aangemaakt + Acties)
- Toolbar: alle BS2 filters + Voltooide verbergen toggle
- 3 modals: taken-add-modal / taken-archive-modal / taken-purge-modal
- Flat table view (geen deadline-grouping)
- 197 teamleden in filter dropdown
- 4 status opties: open / in_progress / voltooid / geannuleerd
- 3 prioriteit opties: hoog / midden / laag

## Schema

- Supabase tabel: `public.taken`
- Velden: id / naam / beschrijving / toegewezenAan / aangemaaktDoor / status / prioriteit / deadline / aanmaakdatum / archived / laatstGewijzigd

## Bugs gefixt

### Bug #59 (UI) — Taken modals close-ways
- Vóór: taken-add gebruikt `style.display` (geen Escape/Overlay), taken-archive + taken-purge gebruiken `hidden` attr maar ook geen Escape/Overlay
- Fix in `taken.js`: globale keydown-handler + overlay-click handler voor alle 3 modals
- Add modal helper `isAddModalOpen()` met `getComputedStyle(m).display !== "none"` check
- Priority Escape: purge → archive → add
