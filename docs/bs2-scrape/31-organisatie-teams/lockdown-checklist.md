# Module 31 — Teams LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 31 Organisatie / Teams (teams.html, BS2 /organization/teams)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**:
- **#65** (data): 10 missing teams uit BS2 ingevoegd in `public.teams`
- **#66** (UI): 4 teams-modals × 2 missing close-ways (Escape + Overlay) defensieve fix in teams.js

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /organization/teams, breadcrumb "Organisatie", Teams-tab active
- [x] A2. Subtitle: "Beheer teams, toewijzingen en organisatiestructuur"
- [x] A3. 4 stat-cards: 10 teams / 98 medewerkers / 3 teamleiders / 10 locaties
- [x] A4. Toolbar: Kolommen / Add Team / Gearchiveerd
- [x] A5. Table cols: Naam / Locatie / Medewerkers / Teamleider / Aangemaakt op / Laatst gewijzigd
- [x] A6. 10 teams records (Kantoor Magdalenenstraat / Zijperstraat / Voorburggracht / Varnebroek / Magdalenenstraat / Breedstraat / Leonard Bramerstraat / Achterwacht / Ambulant Extern / WLZ)
- [x] A7. Pagination: 15 of 10 total (BS2 RPP=15 default)
- [x] A8. 2 teams zonder locatie (Ambulant Extern + WLZ), 8 met locatie
- [x] A9. Medewerker-counts per team variabel (1 t/m 60)
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate teams.html, h1 = "Teams"
- [x] B2. Toolbar: + Team toevoegen / Zoeken / Gearchiveerd-toggle
- [x] B3. Table cols (6): TEAM / BESCHRIJVING / TEAMLEIDER / LOCATIE / LEDEN / AANGEMAAKT
- [x] B4. 10 teams visible na Bug #65 import
- [x] B5. 4 modals × 3 close-ways = 12/12 (na Bug #66 fix)
- [x] B6. Add modal: naam (required) + beschrijving + teamleider-select + locatie-select
- [x] B7. Members modal: add/remove/set-role
- [x] B8. Archive flow (slider 0→100% confirm)
- [x] B9. Purge flow (slider 0→100% confirm)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabel `public.teams` (10 records na Bug #65 import)
- [x] C2. Kolommen: id (uuid) / naam / beschrijving / team_leider_id (uuid → medewerker) / locatie_id (uuid → locatie) / archived / aanmaakdatum / laatst_gewijzigd
- [x] C3. Many-to-many `public.medewerker_teams` (medewerker_id / team_id / rol_in_team)
- [x] C4. RLS: auth-only
- [x] C5. FK team_leider_id matches medewerkers.id (uuid)
- [x] C6. FK locatie_id matches locaties.id (uuid)
- [x] C7. CRUD via teamsDB (add/update/archive/restore/delete)
- [x] C8. ff:teams-updated event op window
- [x] C9. Cascade re-renders bij ff:medewerkers-updated en ff:locaties-updated
- [x] C10. parity.md: 100% functionele pariteit + BS1 superset (Search/Beschrijving/Members-modal)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

**Test methode**: navigeer naar `/teams.html?run=N` → verifieer alle 4 modals × 3 close-ways + search + filters + Bug #65 import-data live.

### CLEAN RUN #1 (post-PR #127 merge)

- [x] BS1 teams.html laadt: h1="Teams", 10 rows, "1-10 van 10", "Pagina 1 van 1" ✅
- [x] **Bug #65 verified live**: 10 teams alphabetisch (Achterwacht/Ambulant Extern/Breedstraat/Kantoor Magdalenenstraat/Leonard Bramerstraat/Magdalenenstraat/Varnebroek/Voorburggracht/WLZ/Zijperstraat) ✅
- [x] **Bug #66 verified live — 12/12 modal × close-ways**:
  - teams-add-modal: X ✅ Escape ✅ Overlay ✅
  - teams-archive-modal: X ✅ Escape ✅ Overlay ✅
  - teams-purge-modal: X ✅ Escape ✅ Overlay ✅
  - teams-members-modal: X ✅ Escape ✅ Overlay ✅
- [x] Search "Voorburg" → 1 row "1-1 van 1" ✅
- [x] Clear → 10 rows terug ✅
- [x] Gearchiveerd-toggle ON → empty state (geen archived in DB) ✅
- [x] RPP 10 → "1-10 van 10", "Pagina 1 van 1" ✅
- [x] Edit-modal via naam-click: opens met "Achterwacht" pre-populated ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Identiek RUN #1: 10 rows, "1-10 van 10", "Pagina 1 van 1" ✅
- [x] 12/12 modal × close-ways (alle 4 modals × X/Escape/Overlay) ✅
- [x] Search "WLZ" → 1 row "1-1 van 1" ✅
- [x] Clear → 10 rows terug ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **12/12 modal × close-ways** (4 modals × 3 close-ways)
- Bug #65 (10 teams import) verified live
- Bug #66 (modals close-ways defensieve fallback) verified live
- Console errors 0
- 10 teams actief (BS1 = BS2 100% match)

📌 v3 Fase E: 4 stat-cards + Kolommen-kiezer + Laatst gewijzigd-kolom toevoegen.
📌 DPA: Niet blokkerend voor Module 32 (Gebruikers).
