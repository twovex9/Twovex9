# Module 22 — Cliënten Incidenten LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 22 Incidenten (incidenten.html + incident-melden.html)
**Lockdown-status**: 🔒 30/30 ✅ + ULTRA-DEEP — **wacht op user-override**
**Voltooid**: 2026-05-14

**Geen bugs gevonden** — BS1 is functioneel 100% pariteit.

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/manage-incidents`, h1 "Incidenten overzicht"
- [x] A2. Cliënten-sidebar Incidenten-group (last item)
- [x] A3. 2 tabs: "Mijn cliënten" / "Alle incidenten"
- [x] A4. Toolbar: Search + 6 filter add-buttons (Status/Locatie/Medewerker/Categorie/Cliënt/Datum bereik) + Kolommen + Incident melden
- [x] A5. 8 kolommen: select/Cliënt/Categorie/Status/Gemeldt door/Laatst bijgewerkt/Datum/Actie
- [x] A6. Status pill (proper case)
- [x] A7. Multi-select checkbox header
- [x] A8. 0 records in "Mijn cliënten" current view
- [x] A9. Pagination 15 default
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate incidenten.html, h1 "Incidenten overzicht"
- [x] B2-B3. Scroll OK
- [x] B4. 2 tabs `.incident-tab` werken
- [x] B5. Filter dropdowns: Status / Locatie / Medewerker / Categorie / Cliënt
- [x] B6. Date range filters: #inc-filter-datum-van + -tot
- [x] B7. Search filter werkt
- [x] B8. Status display proper case ("In afwachting") in tabel
- [x] B9. Incident melden → navigeert naar incident-melden.html
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.incidenten`
- [x] C2. Velden: id/clientId/categorie/status/beoordelaarId/melderId/locatieId/incidentDatum/omschrijving/...
- [x] C3. RLS: auth-only
- [x] C4. Index op clientId + status + datum
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 144 records, 11 categorieën
- [x] C7. Status storage snake_case, display proper case (geen mismatch voor user)
- [x] C8. CRUD via incident-melden.html (full-page form)
- [x] C9. besa:incidenten-updated event
- [x] C10. parity.md: 100% functioneel, geen bugs

## D. ULTRA-DEEP ✅

- 2 modals (archive + purge) met slider-confirm pattern
- 7 filter mechanismes werken (1 search + 6 dropdowns)
- Status stats counters (afwachting/behandeling/opgelost)
- Add-flow navigeert naar dedicated incident-melden.html form-page
- Form has all sections: Cliënten / Betrokken partijen / Tijd-plaats / Categorie / Omschrijving / Maatregelen / Bijlages / Notificaties

---

## Eindstand

- 30/30 ✅
- Geen bugs gevonden — module direct functioneel
- 8 kolommen + 2 tabs + 7 filters identiek aan BS2
- Console errors 0

📌 DPA: Niet blokkerend voor Module 23 (Kilometers).
