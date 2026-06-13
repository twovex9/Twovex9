# v3 Hardcore Module Checklist — BS1 productie-readiness

**Status**: 🔄 IN UITVOERING (per module)
**Methode**: BS2 + BS1 live side-by-side via Chrome MCP. Per item ✅/❌. Pas door naar volgende module bij 100% ✅ + user-bevestiging.

---

## Per module 30 items (universele checklist)

### A. Navigatie + topbar (5 items)
1. Topbar logo links → klik → naar home.html
2. Topbar alle nav-items aanwezig + identiek aan BS2
3. Topbar dropdowns openen op hover/click + alle sub-items werken
4. Help-icoon (?) opent helpdesk-modal (3 close-ways)
5. Notification-bell opent panel (alleen werkende dynamische, geen dead static)

### B. User-menu + auth (3 items)
6. User-avatar rechtsboven toont eigen initialen + email als title
7. Klik avatar → dropdown met "Mijn profiel" + "Uitloggen"
8. Uitloggen → naar login.html

### C. Pagina-content (10 items)
9. URL is correct (BS1 .html, BS2 path)
10. Page-title in browser-tab correct
11. H1 op pagina correct + identiek aan BS2
12. Toolbar elementen (search, filters, knoppen) aanwezig
13. Tabel-headers identiek aan BS2 (kolomnamen + volgorde)
14. Tabel-rijen tonen data (geen lege state als BS2 data heeft)
15. Aantal records BS1 = BS2 (of BS1 ≥ BS2 superset)
16. Pagina rendert binnen 3 seconden
17. Geen visuele afwijkingen tov BS2 (kolombreedtes, paddings, kleuren huisstijl-conform)
18. Mobile / responsive werkt (window-resize → niet kapot)

### D. Acties + modals (7 items)
19. Primaire knop (+Toevoegen / + Nieuw) opent modal
20. Modal heeft 3 close-ways (× / Escape / Overlay-click)
21. Form-validatie werkt (verplichte velden, formaten)
22. Submit → success toast + tabel refresh
23. Edit-icoon / klik op rij → edit-modal
24. Archive/delete via slider-confirm (zoals huisstijl voorschrijft)
25. Restore (bij gearchiveerde rij) = direct, geen modal

### E. Data + audit (3 items)
26. Console errors check (F12) = 0 BS1-errors
27. Network 4xx/5xx errors = 0
28. Audit-log row geschreven bij elke create/edit/archive/delete actie

### F. Permissions + edge cases (2 items)
29. Niet-admin-tier ziet geen admin-only knoppen
30. Empty state correct (geen data → vriendelijk bericht, geen crash)

---

## 36 modules in volgorde

### Module 1 — Home (`home.html`)
- BS2: `https://etf.acceptance.besasuite.nl/home`
- BS1: `https://futureflow-app.vercel.app/home.html`
- Items specifiek: Welkom + voornaam | Nieuws & Mededelingen tegelijk met BS2 (15 cards) | Card → modal | Modal close × / Escape / Overlay
- Sidebar items: GEEN (home heeft geen sidebar)

### Module 2 — Planning (`planning.html`)
- BS2: `/planning`
- BS1: `/planning.html`
- Items specifiek: Kalender-view | Filter dropdown (Medewerker / Team / Locatie / Cliënt) | Diensten worden gerendered | Klik dienst → detail-modal | Knop "+ Dienst toevoegen"

### Module 3 — Urenregistratie (`werkuren.html` + `werkuren-labels.html`)
- BS2: `/urenregistratie/werkuren`
- BS1: `/werkuren.html`
- Items specifiek: Datum-filter + Medewerker-filter | Lijst uren | Klik rij → edit-modal | Goedkeur-flow | Labels-sub-page

### Module 4 — HR Medewerkers (`index.html`)
- BS2: `/hr/medewerkers`
- BS1: `/index.html`
- Items specifiek: Tabel met 10+ kolommen | Search | Gearchiveerd-toggle | Klik medewerker → detail-pagina

### Module 5 — HR Competenties (`competenties.html`)
- Specifiek: Lijst + Add / Edit / Archive | Klik comp → detail-pagina

### Module 6 — HR Opleidingen (`opleidingen.html` + `opleiding-detail.html`)
- Specifiek: Lijst + filters + detail-pagina + medewerker-koppeling

### Module 7 — HR Locaties (`locaties.html` + `locatie-detail.html`)

### Module 8 — HR Salarishuis (`salarishuis.html` + `salarishuis-wijzigingsgeschiedenis.html`)

### Module 9 — HR Bureau's (`bureaus.html` + `bureau-detail.html`)

### Module 10 — HR Salarisadministratie (`salarisadministratie-exporter.html`)
- Specifiek: Export-flow + history-tabel

### Module 11 — HR Verlof (`verlof.html` + `verlofstanden.html` + `plus-minuren.html` + `verloftypes.html`)
- Sidebar group met 4 sub-items

### Module 12 — HR Verzuim (`verzuim.html`)

### Module 13 — HR Nieuws (`nieuws.html`)

### Module 14 — Cliënten overview (`clienten.html` + per-client `client-detail.html`)
- Detail heeft 7+ tabs: Overzicht | Beschikkingen | Documenten | Notities | Incidenten | etc.

### Module 15 — Cliënten Zorgsoorten (`zorgsoorten.html` + `zorgsoort-detail.html`)

### Module 16 — Cliënten Beschikkingen (`beschikkingen.html` + `beschikking-detail.html` + `beschikkingen-dashboard.html`)
- Detail heeft tarieven + notities + audit-log tab

### Module 17 — Cliënten Organisaties (`organisatie.html` + `organisatie-detail.html`)
- Niet verwarren met Module 30 "Organisatie - Rollen"

### Module 18 — Cliënten Gemeenten (`gemeenten.html` + `gemeente-detail.html`)

### Module 19 — Cliënten Urendeclaraties (`urendeclaraties.html`)

### Module 20 — Cliënten Uren budgetering (`uren-budgettering.html`)

### Module 21 — Cliënten Facturen importeren (`facturen-importeren.html`)
- 2-step wizard (Bestand kiezen → Controleren → Import)

### Module 22 — Cliënten Incidenten (`incidenten.html` + `incident-melden.html` + `incidenten-dashboard.html` + `incidenten-categorieen.html`)

### Module 23 — Kilometers (`kilometers.html`)

### Module 24 — Facturen te beoordelen (`facturen-te-beoordelen.html`)

### Module 25 — Facturen alle (`facturen.html`)

### Module 26 — Taken (`taken.html`)

### Module 27 — Medewerker-detail (`medewerker.html`)
- 7 tabs: NAW | Contract | Verlof | Verzuim | Documenten | Notities | Competenties

### Module 28 — Beleid (`beleid.html`)

### Module 29 — Audit (`audit.html`)
- Filters per resource/actie + detail-modal

### Module 30 — Organisatie Rollen (`rollen.html`)
- Organogram view + 14 rollen 5 sections

### Module 31 — Organisatie Teams (`teams.html`)
- Members-modal per team

### Module 32 — Instellingen Gebruikers (`instellingen.html` tab — of `gebruikers.html` voor admin)
- NIEUW G.5: gebruikers.html voor admin-tier

### Module 33 — Instellingen Entiteiten (`instellingen.html` tab)

### Module 34 — Instellingen Notificaties (`instellingen.html` tab + `notifications.html`)

### Module 35 — Mijn-gegevens (`mijn-gegevens.html`)
- GDPR-export + 5 retention-policies + Art.15 inzage

### Module 36 — Manual
- BS2 heeft, BS1 niet (per user-keuze #7)

---

## Sub-pagina's + modals + form-velden = uitwerken per module

Bovenstaande is de **inventaris**. Per module open ik live BS2 + BS1, doe ik alle 30 items van de universele checklist, plus alle module-specifieke items (toolbars, tabs, dropdowns, modal-form-velden). Per gap → fix.

---

## Voortgang

| Module | Status | Bugs gevonden | Bugs gefixt |
|---|---|---|---|
| 1. Home | 🔄 START | — | — |
| 2-36 | ⬜ wachten | — | — |
