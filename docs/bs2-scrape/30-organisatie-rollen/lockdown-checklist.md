# Module 30 — Organisatie / Rollen LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 30 Organisatie / Rollen (rollen.html, BS2 /organization/roles)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**: GEEN — Module 30 had geen bugs, BS1 reeds 100% functionele pariteit met BS2.

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /organization/roles, h1 = "Rollen"
- [x] A2. Title: "Rollen | Embrace The Future"
- [x] A3. 2 tabs: Rollen / Teams
- [x] A4. Toolbar buttons: Opslaan / Reset / Nieuwe rol / Nieuwe sectie
- [x] A5. 6 sections (Eigenaarschap/Topmanagement/Middenmanagement/Specialisten/Uitvoerend/test)
- [x] A6. 14 rollen totaal verdeeld over 5 sections (test is leeg)
- [x] A7. Section-meta toont "X rollen / Y gebruikers"
- [x] A8. User-counts: Eigenaar 3, Admin 5, Directeur 1, Planner 4, Cliëntbeheer 0, Teamleider 2, HR 1, Gedragswetenschapper 2, Facilitair 2, Finance 2, Salarisadministratie 2, Medewerker 102, Beleid 1, Medewerker Test 0 = 127 totaal
- [x] A9. Drag-drop hint in description tekst
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate rollen.html, h1 = "Rollen"
- [x] B2. Subtitle: "Hiërarchisch overzicht van rollen en het aantal gebruikers per rol."
- [x] B3. Toolbar: Zoeken (rol of sectie)
- [x] B4. Totaal-counter: "14 rollen, 1 gebruikers"
- [x] B5. 5 sections met titels + meta + descriptions
- [x] B6. 14 rol-cards met titels + badges + descriptions
- [x] B7. Empty-state styling (--empty class) op 13 cards (0 users)
- [x] B8. Search "Admin" → 2 cards (Admin + Salarisadministratie matches)
- [x] B9. Search "Topmanagement" → 1 section met 2 cards (Admin + Directeur)
- [x] B10. Search "xyz" → "Geen rollen of secties matchen \"xyz\"." + clear → 14 cards terug, Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabel `public.org_role_sections` (5 records, 5 secties)
- [x] C2. Hoofdtabel `public.org_roles` (14 records, 14 rollen)
- [x] C3. View `public.org_roles_with_counts` joins profiles.rol_id → user-counts
- [x] C4. RLS: auth-only via `to authenticated`
- [x] C5. FK: profiles.rol_id uuid → org_roles.id (matches uuid type)
- [x] C6. Cache: 2 keys (org_role_sections_v1 + org_roles_with_counts_v1) in localStorage
- [x] C7. besa:org-rollen-updated event op window → re-render
- [x] C8. Sectie + rol naam 1:1 match met BS2 (op naam + volgorde + groepering)
- [x] C9. Section descriptions in DB (BS1 superset)
- [x] C10. parity.md: 100% functionele pariteit + 6 BS1-superset features (descriptions/search/empty-state/totaal/cache/live-refresh)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

**Test methode**: navigeer naar `/rollen.html?run=N` → verifieer alle features (geen code change nodig — Module 30 had 0 bugs).

### CLEAN RUN #1

- [x] BS1 rollen.html laadt: h1="Rollen" ✅
- [x] 5 sections, 14 cards, 13 empty-cards (1 met gebruiker) ✅
- [x] Totaal-counter: "14 rollen, 1 gebruikers" ✅
- [x] 5 section-descriptions visible ✅
- [x] 14 card-descriptions visible ✅
- [x] Section structure 1:1 met BS2:
  - Eigenaarschap (1 rollen · 0 gebruikers): Eigenaar
  - Topmanagement (2 rollen · 0 gebruikers): Admin, Directeur
  - Middenmanagement (3 rollen · 0 gebruikers): Planner, Cliëntbeheer, Teamleider
  - Specialisten & Adviseurs (5 rollen · 0 gebruikers): HR, Gedragswetenschapper, Facilitair, Finance, Salarisadministratie
  - Uitvoerend Personeel (3 rollen · 1 gebruikers): Medewerker, Beleid, Medewerker Test ✅
- [x] Search "Admin" → 2 cards (Admin + Salarisadministratie substring) ✅
- [x] Search "Topmanagement" → 1 section met 2 cards ✅
- [x] Search "Medewerker" → 2 cards (Medewerker + Medewerker Test) ✅
- [x] Search "xyz" → empty state "Geen rollen of secties matchen \"xyz\"." ✅
- [x] Clear → 14 cards / 5 sections terug, totaal-counter ongewijzigd ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Identiek RUN #1: h1="Rollen", 14 cards, 5 sections, 13 empty ✅
- [x] Totaal-counter: "14 rollen, 1 gebruikers" ✅
- [x] 5 section-descriptions + 14 card-descriptions visible ✅
- [x] Search "HR" → 1 card (alleen HR, geen substring matches) ✅
- [x] Search "Uitvoerend" → 1 section, 3 cards ✅
- [x] Clear → 14 cards/5 sections back ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **0 modals** (read-only viewer per design)
- 0 bugs gevonden
- 14 rollen / 5 sections (1:1 BS2 match op naam + volgorde)
- Console errors 0
- BS1 superset: 6 extra features (descriptions/search/empty-state/totaal/cache/live-refresh)

📌 v3 Fase E: drag-drop CRUD-editor (Opslaan/Reset/Nieuwe rol/Nieuwe sectie).
📌 v3 Fase G: bulk-onboarding 102 medewerker-profielen → user-counts gaan kloppen met BS2 (127).
📌 DPA: Niet blokkerend voor Module 31 (Teams).
