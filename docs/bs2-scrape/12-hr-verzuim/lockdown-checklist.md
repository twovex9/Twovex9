# Module 12 — HR Verzuim LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 12 HR Verzuim (verzuim.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bug #33 fix applied, wacht op post-merge verify + CLEAN RUNS
**Gestart**: 2026-05-14

**Belangrijke bevindingen**:
- BS2 heeft Verzuim als **top-level** sidebar item (na Verlof-groep, vóór Nieuws)
- BS1 had Verzuim **genest onder Compensatie** — structureel niet conform BS2
- Functioneel matchen alle features (tabs, modals, slider-confirm, search, kolommen)

**Bug #33 gefixt via PR #pending** (sidebar-relocation Verzuim):
- Verzuim verwijderd uit Compensatie-groep (`side-group__panel`)
- Top-level `<a href="verzuim.html" class="side-link">Verzuim</a>` toegevoegd vóór Nieuws in alle 23 HR-pagina's met sidebar

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

## D. ULTRA-DEEP CLEAN RUNS (pending — na merge Bug #33 PR)

### CLEAN RUN #1 (post-restructure, fresh)
- pending

### CLEAN RUN #2 (ZONDER fix tussendoor)
- pending

---

## Eindstand

- Pending na PR-merge:
  - 30/30 ✅
  - 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor
  - Bug #33 (sidebar-relocation Verzuim) verified
  - Console errors 0
- User-override afwachten

📌 DPA: Niet blokkerend voor Module 13 (Fase A).
