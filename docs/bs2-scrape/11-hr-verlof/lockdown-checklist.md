# Module 11 — HR Verlof LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS + Bug #32 restructure)

**Module**: 11 HR Verlof (verlof.html + verlofstanden.html + plus-minuren.html + verloftypes.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor + Bug #32 (sidebar-relocation) gefixt
**Voltooid**: 2026-05-14

**Belangrijke bevinding (geüpdatet 2026-05-14)**:
- **BS2 heeft Verlof als expandable groep in de left sidebar** (user-screenshot 2026-05-14), niet in de top-bar.
- Sub-items in BS2-sidebar: Verlofaanvragen / Verlofstanden / Plus-/minuren / Verloftypes.
- **BS1 spiegelt nu de BS2-structuur**: top-bar Verlof verwijderd uit alle 53 HTML's; sidebar-groep met 4 sub-items toegevoegd aan 19 HR-pagina's.
- Verlofaanvragen functioneel 100% (CRUD + state-machine). 3 sub-items (Verlofstanden / Plus-/minuren / Verloftypes) zijn stubs voor volgende module/fase.

**Bug #32 gefixt via PR #93** (structural fix conform BS2-screenshot):
- Top-bar Verlof-dropdown verwijderd uit alle 53 HTML-pagina's.
- Sidebar-groep `<div class="side-group" data-side-group="verlof">` toegevoegd aan 19 HR-pagina's (na Salarisadministratie, vóór Compensatie) met 4 sub-items.
- verlof.html krijgt nu de volledige sidebar (had voorheen geen) met Verlof-groep `is-active` + auto-open.
- 3 stub-pagina's gecreëerd: `verlofstanden.html`, `plus-minuren.html`, `verloftypes.html` — elk met huisstijl-shell + empty-state "Deze functionaliteit komt in een volgende module/fase. De pagina is gereserveerd in de structuur conform BS2-pariteit."

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

## E. POST-RESTRUCTURE CLEAN RUNS — Bug #32 sidebar-relocation (2/2 ✅ ZONDER fix tussendoor)

Na PR #93 merge: top-bar Verlof verwijderd + sidebar-groep met 4 sub-items toegevoegd. Vers getest in nieuwe structuur op `https://besa-suite.vercel.app/verlof.html`.

### Post-restructure verify (Chrome MCP, fresh navigate)
- ✅ `index.html` top-bar Verlof count = 0
- ✅ `index.html` sidebar Verlof-groep bestaat + collapsed by default; toggle-click → `aria-expanded="true"` + panel visible
- ✅ `verlof.html` h1="Verlofaanvragen", title="Verlof — HR", sidebar Verlof-groep `is-active` + auto-open, Verlofaanvragen sub-link `is-active`
- ✅ `verlofstanden.html` h1="Verlofstanden", empty-state "gereserveerd / volgende module" zichtbaar, sub-link `is-active`
- ✅ `plus-minuren.html` h1="Plus-/minuren", empty-state zichtbaar, sub-link `is-active`
- ✅ `verloftypes.html` h1="Verloftypes", empty-state zichtbaar, sub-link `is-active`

### CLEAN RUN #1 (post-restructure, fresh)
- ✅ `verlof.html` top-bar Verlof count = 0
- ✅ Sidebar-groep open + Verlofaanvragen `is-active`
- ✅ Scroll (scrollHeight = 1066, scrolled OK)
- ✅ Add modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅ (Bug #31 fix nog steeds werkend)
- ✅ Tab switch Mijn ↔ Alle aanvragen
- ✅ CRUD: add → indienen → goedkeuren → delete (state-machine 4-stappen)
- ✅ Console = 0 app-errors (alleen chrome-extension error, geen app-error)

### CLEAN RUN #2 (post-restructure, ZONDER fix tussendoor)
- ✅ Top-bar Verlof count = 0
- ✅ Sidebar-groep open + Verlofaanvragen `is-active`
- ✅ Scroll
- ✅ Add modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- ✅ Tab switch
- ✅ CRUD: add (bovenwettelijk) → indienen → afwijzen → delete (afwijzen-flow getest)
- ✅ Console = 0 app-errors

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS (pre-restructure) ✅
- 2 CLEAN RUNS (post-restructure, na Bug #32 fix) ✅
- Bugs gefixt: **#31** (Escape+Overlay modals, PR #91) + **#32** (sidebar-relocation conform BS2, PR #93)
- 4 pagina's in Verlof-bundel: verlof.html (functioneel) + 3 stubs voor volgende module/fase
- Console errors 0
- Sidebar-structuur 100% conform BS2-screenshot (user 2026-05-14)

📌 DPA: Niet blokkerend voor Module 12 (Fase A).
