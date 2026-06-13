# Module 35 — Mijn-gegevens — BEHAVIORS

## Initial render
- `mijn-gegevens.js` page-script
- Fetches profile + medewerker + counts via Supabase
- Renders 12-stat grid
- Renders 5 AVG-rights + 5 retention-policies (statisch HTML)
- "Geëxporteerd op" timestamp = NOW() (per pagina-render)

## Stats (12 cards)
1. NAAM — profile.voornaam + " " + profile.achternaam
2. E-MAIL — profile.email
3. ROL — profile.rol (admin/medewerker/viewer)
4. MEDEWERKER-ID — profile.medewerker_id (uuid)
5. FUNCTIE — medewerker.data.functie of "—"
6. FASE — medewerker.fase (in_dienst/uit_dienst)
7. DIENSTVERBAND — medewerker.data.dienstverband
8. NOTITIES (HR) — COUNT(medewerker_notities WHERE medewerker_id = ...)
9. DOCUMENTEN — COUNT(medewerker_documenten WHERE medewerker_id = ...)
10. VERZUIM-PERIODEN — COUNT(medewerker_verzuim_perioden WHERE medewerker_id = ...)
11. PLANNING-SHIFTS — COUNT(planning WHERE medewerker_id = ...)
12. GEËXPORTEERD OP — NOW() in NL-locale

## Download JSON-button
- Klik → genereer JSON-blob met alle data over current user
- File-naam: `mijn-ff-data-<datum>.json`
- Triggers browser-download via `<a download>` of `URL.createObjectURL`

## Vernieuwen-button
- Klik → re-fetch data uit Supabase
- Update stats + GEËXPORTEERD OP timestamp
- Stille catch op error (geen blocking modal)

## AVG-rechten sectie
- Statische HTML met 5 rights (Art. 15/16/17/20/21)
- Email-link `privacy@etfalkmaar.nl` (placeholder, niet clickable yet)

## Retention sectie
- Statische HTML met 5 retention-policies
- Verwijst naar SQL-functie `gdpr_retention_run_v1()`

## Geen modals
- Module 35 heeft geen modals
- Geen Add/Edit/Archive flows (read-only inzage)
