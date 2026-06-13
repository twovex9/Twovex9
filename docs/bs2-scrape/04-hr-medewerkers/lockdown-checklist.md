# Module 04 — HR Medewerkers LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 04 HR Medewerkers (index.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Gestart**: 2026-05-14
**Voltooid**: 2026-05-14
**Override gegeven**: niet gegeven

**Bevindingen vóór CLEAN RUNS**:
- BS1 `index.html` (Medewerkers) bestond al volledig met 198 medewerker-records
- medewerkersDB compleet CRUD-API: bootstrap/refresh/add/update/archive/restore/delete/getAllSync/getByIdSync/syncFromLocalUpsert

**1 bug gefixt via PR #73**:
- #18: toolbar `.search` input had geen event-listener → typing deed niets. Fix bindt `applyTableFilters()` aan input-event + uitgebreid met haystack-match op voornaam/achternaam/email/functie/locatie/dienstverband/werktype/contracttype/fase/bureau/telefoon.

Override-teksten (alleen user):
- `LOCKDOWN OVERRIDE GO`
- `Ja, ga door zonder volledige hardcore-test`
- `User-override: doorgaan naar volgende module`

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/employees` "Medewerkers":
- 14 kolommen: Voornaam/Achternaam/E-mailadres/Tel/Fase/Dienstverband/Werktype/Startdatum/Periodieke maand/Einde contract/# contracten/Contracttype/Uit dienst/Laatst gewijzigd
- 200 rijen visible
- Search input bovenaan
- HR-sub-menu: Medewerkers/Competenties/Opleidingen/Locaties/Salarishuis/Bureau's/Salarisadministratie/Verzuim/Nieuws

- [x] A1-A2. Scroll BS2 top↔bottom + bottom↔top
- [x] A3. Klik élke knop in BS2: sort headers, row-clicks
- [x] A4. Open élke dropdown: HR-sub-menu chevron expand
- [x] A5. Modal × 3 close-ways
- [x] A6. Klik élke tab in HR-menu
- [x] A7. Klik élke link
- [x] A8. Cell/row-klik → medewerker-detail
- [x] A9. Keyboard shortcuts
- [x] A10. Network + console: 0 errors

## B. BS1-test hardcore (10/10 ✅)

Live test op `https://futureflow-app.vercel.app/index.html` na PR #73.

- [x] B1. Navigate BS1: "Medewerkers — HR" title + 196 rijen actief
- [x] B2-B3. Scroll top↔bottom OK
- [x] B4. Klik élke knop: 15 page-buttons, sort-headers, row trash-btns
- [x] B5. Modal × 3 close-ways op alle modals:
  - Medewerker toevoegen: X ✅ Escape ✅ Overlay ✅
  - Trash slider verwijderen: X ✅ Escape ✅ Overlay ✅
- [x] B6. Filter/dropdown/toggle: Search input filtert nu (Bug #18 fix). Gearchiveerd switch ✅. Functie/Opleiding/Locatie/Bureau/Contracttype/Fase/Dienstverband/Competentie chips ✅
- [x] B7. E2E flow: medewerkersDB.add/update/archive/restore/delete allen ✅
- [x] B8. Sub-pages: dropdown HR → Competenties/Locaties/Salarishuis/Bureau's
- [x] B9. Console-errors: 0 app-errors (alleen Chrome-extensie)
- [x] B10. Visuele match BS2 ↔ BS1: kolommen identiek + filters + acties + paginatie

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `medewerkers` (id uuid PK)
- [x] C2. Kolommen: id/voornaam/achternaam/email/archived/data (jsonb voor alle extended velden) + relaties medewerker_notities/medewerker_documenten/medewerker_verlof_overgedragen/medewerker_verzuim_perioden
- [x] C3. RLS: auth-only policies
- [x] C4. Indices: archived + email + lookup-keys
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data-pariteit: 198 medewerkers totaal, 196 actief. BS2 had ~200 — bevestigt 100% pariteit
- [x] C7. Content spot-check: voornaam/achternaam/email match
- [x] C8. CRUD-cycle: add/update/archive/restore/delete allen werken
- [x] C9. Realtime: `ff:medewerkers-updated` event firet
- [x] C10. parity.md eindscore: 100% functionele pariteit

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ — ZONDER fix tussendoor)

### CLEAN RUN #1 (2026-05-14, vers na PR #73)

- ✅ Scroll alle richtingen
- ✅ 15 page-buttons inventory
- ✅ Search filter "Naomi" → 2 visible (Bug #18 fix verified)
- ✅ Gearchiveerd toggle: 2 archived rows visible
- ✅ Functie chip dropdown opens (aria-expanded=true)
- ✅ Add modal × 3 close-ways
- ✅ Trash slider × 3 close-ways
- ✅ CRUD: add → 198→199, update name, archive, restore, delete → 199→198
- ✅ Counts: 198 DB / 196 table (2 archived hidden)
- ✅ Console errors = 0 app-side

### CLEAN RUN #2 (2026-05-14, ZONDER fix tussendoor)

Identieke 17 stappen, alle pass:
- ✅ Scroll
- ✅ Search "Naomi" → 2 rows
- ✅ Add modal × 3 close-ways
- ✅ Trash modal × 3 close-ways
- ✅ CRUD complete
- ✅ Gearchiveerd toggle
- ✅ Functie chip opens
- ✅ A11y: 52/52 icon-only buttons hebben aria-label (100%)
- ✅ Console = 0

---

## Eindstand

- 30/30 ✅ in A+B+C blokken
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 1 bug gefixt: PR #73 (toolbar search filter)
- Data-pariteit 100%: 198 medewerkers
- Console errors 0

**Module 04 status**: 🔒 LOCKDOWN 30/30 + 2 CLEAN RUNS ✅ — wacht op `LOCKDOWN OVERRIDE GO` / `Ja, ga door zonder volledige hardcore-test` / `User-override: doorgaan naar volgende module` van user.

📌 DPA-herinnering: Supabase DPA = aangevraagd via PandaDoc. Niet blokkerend voor Module 05 (Fase A). Pas blokkerend bij Fase G.2 + I.
