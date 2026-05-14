# Module 27 — Medewerker-detail LOCKDOWN CHECKLIST

**Module**: 27 Medewerker-detail (medewerker.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bug #61 fix applied, wacht op merge + 2 HARDCORE CLEAN RUNS
**Gestart**: 2026-05-14

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

## D. 2 HARDCORE CLEAN RUNS (pending — na PR-merge)

### CLEAN RUN #1 — pending
### CLEAN RUN #2 (ZONDER fix tussendoor) — pending

---

## Eindstand (pending)
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS pending
- Bug #61 verified
- Console errors 0

📌 DPA: Niet blokkerend voor Module 28 (Beleid).
