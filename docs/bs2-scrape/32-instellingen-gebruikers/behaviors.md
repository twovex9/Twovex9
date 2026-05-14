# Module 32 — Instellingen / Gebruikers — BEHAVIORS

## Tab-switch
- `filter-chip` buttons met `role="tab"` + `aria-selected`
- 5 tabs: profiel / gebruikers / mijn-notificaties / notificaties / entiteiten
- Klik tab → toon panel `#inst-panel-<key>` + hide andere panels (display:none)

## Render Gebruikers tab
- `renderGebruikers()` in instellingen.js (line 145-190)
- `window.profilesDB.getAllSync()` → toont alle profielen
- Indien empty → `await profilesDB.refresh()` voor fresh fetch
- Filter op search-query (voornaam + achternaam + email + rol)
- Sort: aanmaakdatum DESC (nieuwste eerst)
- Per row: data-col attrs op TD (Bug #64-pattern al goed)

## Status badge
- Alle profielen tonen "Actief" badge (groen)
- Geen archived-state in profile table (anders dan medewerkers)

## Search
- Live filter on input (geen debounce)
- Searches: voornaam + achternaam + email + rol (case-insensitive)
- Count update: "X van Y" (X = filtered, Y = totaal)

## Kolommen-kiezer
- 4 toggleable kolommen (E-mailadres / Rollen / Status / Aanmaakdatum)
- Naam = skipToggle=true (altijd zichtbaar)
- Voorkeuren in localStorage `inst_gebruikers_columns_v1`
- TH + TD beide hebben `data-col` → toggle hide werkt op beide

## Geen CRUD-flows
- "Gebruikers worden beheerd via Supabase Auth dashboard." hint
- Geen Add-user button (BS2 heeft "Gebruiker toevoegen")
- Geen archive/restore/delete buttons (BS2 heeft "Gearchiveerd" toggle)
- v3 Fase G: bulk-onboarding via Node-script + Gebruikersbeheer-pagina

## Events
- Tab-switch event tracked in `state.activeTab`
- Live re-render: niet automatisch — manual refresh via search-input dispatch

## Geen modals
- Module 32 Gebruikers tab: 0 modals
- (Andere instellingen.html modals zoals `inst-nt-modal` zijn voor Notificatietypes-tab — Module 34 scope)
