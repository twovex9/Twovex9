# Module 27 — Medewerker-detail LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 27 Medewerker-detail (medewerker.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#61** (UI): 4 emp-modals close-ways defensieve fallback in medewerker.js

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /hr/employees/{id}/details, h1 = medewerker naam
- [x] A2. 6 tabs: Details / Professioneel / Opleiding / Notities / Documenten / Verzuim
- [x] A3. Sidebar card met photo + naam + email + Waarschuwingen + Inloggen + Planningstatus + Contact + Adres
- [x] A4. Tab Details: Medewerker gegevens (10 velden) + Adres + Contactpersoon + Dienstverband
- [x] A5. Wijzigingen opslaan per sectie
- [x] A6. Inhuur / Rechtstreekse plaatsing toggle
- [x] A7. CAO Type dropdown
- [x] A8. BSN + Geboortedatum + Taal velden
- [x] A9. Waarschuwingen panel (bv. opleiding-vervaldatum)
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate medewerker.html, h1 dynamic
- [x] B2-B3. Scroll OK + Sidebar sections renderen
- [x] B4. **7 tabs** alle clickable (BS1 superset met Verlof)
- [x] B5. Tab Details sections geverifieerd
- [x] B6. Tab Professioneel: Locaties/Urenregistratie/Salaris/Rooster
- [x] B7. Tab Opleiding: SKJ + Education
- [x] B8. Tab Notities + Documenten + Verzuim + Verlof
- [x] B9. 4 modals × 3 close-ways = 12/12 (na Bug #61 fix)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabel `public.medewerkers` (101 records na Module 26 Bug #60 dedupe)
- [x] C2. Sub-tabellen: medewerker_documenten/notities/verlof_overgedragen/verzuim_perioden/teams
- [x] C3. RLS: auth-only
- [x] C4. Data jsonb voor extensible fields (NAW + contract + salaris + locaties)
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. CRUD via per-sectie save buttons
- [x] C7. Document-upload via Storage bucket "medewerker-documenten"
- [x] C8. besa:medewerker-updated event
- [x] C9. Inloggen als (admin-functie) wordt via auth.admin.updateUserById
- [x] C10. parity.md: 100% functioneel + BS1 superset (Verlof-tab)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

**Test methode**: navigeer via /index.html → selecteer eerste medewerker rij ("Oumaima Achefay") → medewerker.html laadt geselecteerde medewerker uit localStorage.

### CLEAN RUN #1 (post-PR #120 Bug #61 fix live)
- ✅ Medewerker "Oumaima Achefay" geladen (title + sidebar card)
- ✅ Alle 7 tabs activate: Details / Professioneel / Opleiding / Notities / Documenten / Verzuim / Verlof
- ✅ Per tab visible h2 sections renderen
- ✅ Verlof tab toont: Verlofsaldo (4 stat-cards) + Overgedragen uren 2025 (4 stat-cards) + Verlofsaldi (tabel jaren 2022-2026) + Verlofaanvraag geschiedenis
- ✅ Alle 4 emp-modals × 3 close-ways = 12/12 (Bug #61 fix verified live):
  - emp-doc-modal: X ✅ Escape ✅ Overlay ✅
  - emp-doc-delete-modal: X ✅ Escape ✅ Overlay ✅
  - emp-verzuim-modal: X ✅ Escape ✅ Overlay ✅
  - emp-verlof-overd-modal: X ✅ Escape ✅ Overlay ✅
- ✅ Sidebar card: Gebruikersinstellingen / Inloggen als / Contactgegevens / Adres / Overige informatie / Verjaardag
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek RUN #1
- ✅ 7 tabs allemaal clickable + render correct
- ✅ 12/12 modal × close-ways
- ✅ Console = 0 app-errors

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **12/12 modal × close-ways** (4 modals × 3 close-ways)
- 7 tabs alle functioneel
- Bug #61 (emp-modals close-ways) verified live
- Console errors 0

📌 DPA: Niet blokkerend voor Module 28 (Beleid).
