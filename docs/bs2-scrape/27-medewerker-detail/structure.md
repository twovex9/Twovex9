# Module 27 — Medewerker-detail — STRUCTURE

**BS2 URL**: `/hr/employees/{id}/details`
**BS1 URL**: `https://besa-suite.vercel.app/medewerker.html?id={id}`
**Scrape datum**: 2026-05-14

## BS2 page
- h1: voor- + achternaam medewerker
- **6 tabs**: Details / Professioneel / Opleiding / Notities / Documenten / Verzuim
- Sidebar card (links): photo + name + email + Waarschuwingen + Gebruikersinstellingen (Inloggen als) + Planningstatus + Contactgegevens + Adres
- Main (rechts): tab-specifieke secties met form-velden + Wijzigingen opslaan per sectie

## BS2 tab Details sections
- Medewerker gegevens (Voornaam/Achternaam/E-mailadres/Telefoonnummer/Roepnaam/Initialen/BSN/Geboortedatum/Taal/CAO Type)
- Adres (Postcode/Huisnummer/Toevoeging/Straat/Plaats)
- Contactpersoon
- Dienstverband (Inhuur / Rechtstreekse plaatsing toggle)

## BS1 mirror

- h1: dynamic op selected medewerker (anders "Medewerker" placeholder)
- **7 tabs**: Details / Professioneel / Opleiding / Notities / Documenten / Verzuim / **Verlof** ← BS1 superset
- Sidebar: zelfde + Overige informatie (medewerkernummer/status/datum uit dienst) + Verjaardag
- 4 modals: emp-doc-modal / emp-doc-delete-modal / emp-verzuim-modal / emp-verlof-overd-modal

## BS1 tab Details
- Medewerker gegevens (10 velden zelfde als BS2)
- Adres
- Contactpersoon
- Dienstverband + Inhuur

## BS1 tab Professioneel
- Locaties / Urenregistratie / Professionele gegevens / Salaris / Rooster / Periodieke maand / Beoordelingsdatum / Uurtarieven

## BS1 tab Opleiding
- SKJ / Education and Training

## BS1 tab Notities
- Nieuwe notitie + lijst bestaande notities

## BS1 tab Documenten
- Documenten-tabel + uploads

## BS1 tab Verzuim
- Korte termijn / Lange Termijn registraties

## BS1 tab Verlof (BS1-only)
- Verlofsaldo
- Overgedragen uren van 2025
- Verlofsaldi
- Verlofaanvraag geschiedenis

## Bug gefixt

### Bug #61 (UI) — 4 modals close-ways
- emp-doc-modal / emp-doc-delete-modal / emp-verlof-overd-modal / emp-verzuim-modal
- Escape close-way ontbrak voor alle 4
- emp-doc-modal + emp-doc-delete-modal: click handlers worden lazy gewired bij document-tab init — als geen medewerker geselecteerd, geen wire-up
- **Fix in medewerker.js**: globale defensieve init-functie `initGlobalEscapeForEmpModals`
  - Globale keydown Escape-handler die alle 4 modals checked (display !== "none")
  - Defensieve overlay-click handler per modal
  - Defensieve X-close fallback handlers

## Schema

- Hoofdtabel: `public.medewerkers`
- Gerelateerde tabellen: medewerker_documenten / medewerker_notities / medewerker_verlof_overgedragen / medewerker_verzuim_perioden / medewerker_teams / werkuren / urenregistratie / verlof_aanvragen
- 101 medewerkers (na Module 26 Bug #60 dedupe)
