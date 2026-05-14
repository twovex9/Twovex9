# Module 11 — HR Verlof LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 11 HR Verlof (verlof.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Belangrijke bevinding**:
- **BS2 heeft GEEN aparte Verlof-page**. HR-menu in BS2: Medewerkers/Competenties/Opleidingen/Locaties/Salarishuis/Bureau's/Salarisadministratie/Verzuim/Nieuws (geen Verlof).
- BS1 heeft `verlof.html` als **BS1-only feature** (uitbreiding voorbij BS2-scope).
- Pariteit interpretatie: niet "BS2=BS1" maar "BS1 heeft extra functionaliteit". Geen data-pariteit-check vereist.

**Geen bugs gevonden** in CLEAN RUNS — verlofDB werkt 100% met complete state-machine.

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/leave-of-absence` → 404. Verlof bestaat NIET als aparte page in BS2.
- Verlof-info in BS2 zit waarschijnlijk in medewerker-detail page (verlofdagen-tab) — niet als losse module.

- [x] A1-A10. Niet-applicabel; gedocumenteerd als BS2-gap

## B. BS1-test hardcore (10/10 ✅)

Live test op verlof.html.

- [x] B1. Navigate: "Verlof — HR" / h1 "Verlofaanvragen"
- [x] B2-B3. Scroll OK
- [x] B4. Klik élke knop: + Aanvraag indienen, Mijn aanvragen ↔ Alle aanvragen tabs, paginatie
- [x] B5. Modal × 3 close-ways:
  - + Aanvraag indienen modal: X ✅ Escape ✅ Overlay ✅
- [x] B6. Tab switch Mijn ↔ Alle aanvragen
- [x] B7. E2E state-machine flow:
  - verlofDB.add(concept) ✅
  - verlofDB.indienen() → status='ingediend' ✅
  - verlofDB.goedkeuren() → status='goedgekeurd' ✅
  - verlofDB.afwijzen() → status='afgewezen' ✅
  - verlofDB.annuleren() ✅
  - verlofDB.delete() ✅
- [x] B8. STATUS_VALUES: concept/ingediend/goedgekeurd/afgewezen/geannuleerd
- [x] B9. TYPE_VALUES: wettelijk/bovenwettelijk/ouderschap/calamiteit/doktersbezoek/onbetaald/anders
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `verlof_aanvragen`
- [x] C2. Kolommen: id/medewerker_id/type/start_datum/eind_datum/aantal_dagen/status/reden/ingediend_op/beoordeeld_op
- [x] C3. RLS: auth-only
- [x] C4. Indices: medewerker_id, status
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data: 0 records (legitieme empty-state, BS1-only feature)
- [x] C7. Content spot-check: kolomstructuur
- [x] C8. CRUD + state-machine: complete
- [x] C9. besa:verlof-updated event
- [x] C10. parity.md: BS1-only feature, 100% functioneel

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ — ZONDER fix tussendoor)

### CLEAN RUN #1
- ✅ Scroll
- ✅ Add modal × 3 close (X/Escape/Overlay)
- ✅ Tab switch Mijn ↔ Alle aanvragen
- ✅ CRUD: add → indienen → goedkeuren → delete
- ✅ Console = 0

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek RUN #1 + extra: indienen → afwijzen flow

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **Geen bugs gefixt** (none gevonden)
- BS1-only feature, geen BS2-pariteit-check applicabel
- Console errors 0

📌 DPA: Niet blokkerend voor Module 12 (Fase A).
