# Module 01: Home — bulk-acties

**Gescraped op**: 2026-05-13

## Conclusie: GEEN bulk-acties

Op de Home-pagina geen tabellen met checkbox-headers of bulk-dropdown:
- Nieuws-feed = card-grid (geen tabel)
- Geen "Selecteer alle" checkbox
- Geen bulk-actie dropdown
- Notification-overview `/notifications` = lijst, geen selectie-mechanisme

## BS1-implicatie

Voor Module 01: **geen bulk-acties te implementeren in Fase E**.

## Bulk-mark-as-read voor notificaties?

Niet zichtbaar op Home of `/notifications`:
- Geen "Markeer alle als gelezen" knop
- Geen "Verwijder alle gelezen" knop
- Notificaties verdwijnen vermoedelijk **automatisch** uit "Ongelezen" tab wanneer geklikt (lazy mark-as-read)

Te bevestigen in Fase B (data-scrape) of via klik-test op één notificatie in latere pass.

(Bulk-acties zijn elders te verwachten: medewerker-lijst, cliënt-lijst, facturen, taken — per module daar gedocumenteerd.)
