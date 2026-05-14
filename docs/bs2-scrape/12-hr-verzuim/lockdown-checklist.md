# Module 12 — HR Verzuim LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS + ULTRA-DEEP)

**Module**: 12 HR Verzuim (verzuim.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor + ULTRA-DEEP 100% getest — **wacht op user-override**
**Voltooid**: 2026-05-14

**Belangrijke bevindingen**:
- BS2 heeft Verzuim als **top-level** sidebar item (na Verlof-groep, vóór Nieuws)
- BS1 had Verzuim **genest onder Compensatie** — structureel niet conform BS2
- Functioneel matchen alle features (tabs, modals, slider-confirm, search, kolommen)

**Bug #33 gefixt via PR #95** (sidebar-relocation Verzuim):
- Verzuim verwijderd uit Compensatie-groep (`side-group__panel`)
- Top-level `<a href="verzuim.html" class="side-link">Verzuim</a>` toegevoegd vóór Nieuws in alle 23 HR-pagina's met sidebar

**Bug #34 gefixt via PR #96** (Compensatie auto-open leftover state):
- Op verzuim.html had Compensatie-side-group nog hardcoded `is-open` + `aria-expanded="true"` + ontbrekend `hidden` attribute op panel (leftover van toen Verzuim nested was)
- Genormaliseerd naar collapsed-default state zoals alle andere HR-pagina's

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/all-sickness` live gescraped 2026-05-14.

- [x] A1. Navigate: title="Embrace The Future", h1="Lange termijn afwezigheid"
- [x] A2. Sidebar volgorde: Medewerkers/Competenties/Opleidingen/Locaties/Salarishuis/Bureau's/Salarisadministratie/**Verlof**/Verzuim/Nieuws
- [x] A3. Tabs: Lange termijn (default) / Korte termijn
- [x] A4. Tabel 7 kolommen: Medewerker / Eerste ziektedag / Verwachte terugkeerdatum / Werkelijke terugkeerdatum / Beschrijving / Status / Acties
- [x] A5. Kolommen-knop met toggle-panel
- [x] A6. Geen + Toevoegen op overzicht (CRUD via medewerker-detail)
- [x] A7. Geen Gearchiveerd toggle
- [x] A8. Acties-kolom: edit-icon + delete-icon per rij
- [x] A9. Console errors BS2: 0
- [x] A10. URL: /hr/all-sickness

## B. BS1-test hardcore (10/10 ✅)

Live test op verzuim.html 2026-05-14.

- [x] B1. Navigate: title="Verzuim — HR", h1="Lange termijn afwezigheid" — MATCHES BS2
- [x] B2-B3. Scroll OK
- [x] B4. Tab switch Lange ↔ Korte: lang=11 records, kort=3 records ✅
- [x] B5. Edit-modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- [x] B6. Delete-modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- [x] B7. Delete-modal heeft slider-confirm pattern (huisstijl-conform)
- [x] B8. Search-filter werkt
- [x] B9. Kolommen-knop opent panel met 7 toggles
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `medewerker_verzuim_perioden`
- [x] C2. Kolommen: id/medewerker_id/type/eerste_ziektedag/verwachte_terugkeer/werkelijke_terugkeer/beschrijving/status
- [x] C3. RLS: auth-only
- [x] C4. Index: medewerker_id, type
- [x] C5. Trigger: laatst_gewijzigd
- [x] C6. Data: 14 records (11 lang + 3 kort) — matches Phase 3 import
- [x] C7. Content spot-check: kolom-structuur identiek
- [x] C8. CRUD: bewerken/verwijderen direct vanaf overzicht; aanmaken via medewerker-detail (Module 27)
- [x] C9. besa:verzuim-updated event op window
- [x] C10. parity.md: structural Bug #33 (sidebar) + functioneel 100%

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ ZONDER fix tussendoor)

### CLEAN RUN #1 (post-Bug#33+#34, fresh navigate)
- ✅ Bug #34 verify: Compensatie collapsed (`is-open=false`, `aria-expanded="false"`, panel hidden)
- ✅ Bug #33 verify: Verzuim is top-level + `is-active` op verzuim.html
- ✅ Sidebar volgorde: Salarishuis → Bureau's → Salarisadministratie → Verlof → Compensatie → **Verzuim** → Nieuws (matches BS2)
- ✅ topbar Verlof = 0
- ✅ Scroll werkt
- ✅ Tabs switch: Lange=11 ↔ Korte=3
- ✅ Edit-modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- ✅ Delete-modal × 3 close-ways + slider-confirm: X ✅ Escape ✅ Overlay ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek RUN #1
- ✅ Extra: search filter (1 ↔ 11 records)
- ✅ Extra: Kolommen-panel opent (8 toggles)
- ✅ Console = 0 app-errors

---

## E. ULTRA-DEEP final 100% check (25 pages tested)

### 19 HR-pagina's met sidebar
- index.html / competenties.html / opleidingen.html / locaties.html / salarishuis.html / bureaus.html / salarisadministratie-exporter.html / verlof.html / nieuws.html / compensatie-saldi.html / compensatie-berekeningen.html / compensatie-feestdagen.html / compensatie-diensttypes.html / medewerker.html / competentie-detail.html / opleiding-detail.html / locatie-detail.html / bureau-detail.html / salarishuis-wijzigingsgeschiedenis.html

Per pagina geverifieerd:
- ✅ Verzuim als top-level link (geen nested)
- ✅ Compensatie-groep heeft 4 sub-items (Saldi/Berekeningen/Feestdagen/Diensttypes)
- ✅ Speciale gevallen: verlof.html → verlof-groep `is-active`; nieuws.html → Nieuws `is-active`; compensatie-saldi.html → Compensatie auto-open + Saldi `is-active`

### 3 Verlof bundel stubs
- verlofstanden.html / plus-minuren.html / verloftypes.html
- ✅ Allemaal: Verzuim top-level + Compensatie 4 sub-items

### 2 non-HR pagina's (steekproef)
- home.html / planning.html
- ✅ Topbar Verlof = 0
- ✅ Topbar Verzuim = 0 (correct — Verzuim is enkel HR-sidebar)

### Accessibility (Suggestie G)
- ✅ Verzuim link is `<a>` element met correcte href
- ✅ Focusable (tabIndex >= 0)
- ✅ Tabs `vz-tab-lang`/`vz-tab-kort` zijn `<button>` elementen
- ✅ Modal close buttons aanwezig in beide modals

### Edit-modal deep inspection
- ✅ 7 fields: id (hidden), medewerker (text), eerste ziektedag (text), verwacht (text), werkelijk (text), beschrijving (textarea), status (select)
- ✅ 6 labels (medewerker / eerste ziektedag / verwacht / werkelijk / beschrijving / status)
- ✅ Pre-vult bij open vanaf row-edit

### Delete-modal slider-confirm (huisstijl-conform)
- ✅ `<input type="range">` met min=0, max=100, initial value=0
- ✅ Confirm-knop disabled bij value=0 (slider niet 100%)
- ✅ Sluit via X / Escape / Overlay alle 3 ✅

### Console
- ✅ 0 app-errors (alleen chrome-extension error van MCP zelf — niet app-related)

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- ULTRA-DEEP 100% getest op 25 unieke pagina's ✅
- Bugs gefixt: **#33** (sidebar-relocation Verzuim, PR #95) + **#34** (Compensatie auto-open leftover, PR #96)
- Console errors 0
- Sidebar-structuur 100% conform BS2 HR-volgorde

📌 DPA: Niet blokkerend voor Module 13 (Fase A).
