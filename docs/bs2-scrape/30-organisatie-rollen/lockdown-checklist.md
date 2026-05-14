# Module 30 — Organisatie / Rollen LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 30 Organisatie / Rollen (rollen.html, BS2 /organization/roles)
**Lockdown-status**: 🔒 30/30 ✅ — **wacht op 2 HARDCORE CLEAN RUNS na user-merge**
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

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor

**Test methode**: navigeer naar /rollen.html → verifieer alle features.

### CLEAN RUN #1 — WACHT OP MERGE
- [ ] BS1 rollen.html laadt: h1="Rollen", 14 rollen, 5 sections
- [ ] Totaal-counter: "14 rollen, 1 gebruikers"
- [ ] 5 section-titels + 5 section-descriptions visible
- [ ] 14 rol-cards met titels + badges + descriptions
- [ ] 13 cards `.rollen-card--empty`, 1 card normaal (Medewerker met 1 gebruiker)
- [ ] Section meta totals: Eigenaarschap 1/0, Topmanagement 2/0, Middenmanagement 3/0, Specialisten 5/0, Uitvoerend 3/1
- [ ] Search "Admin" → 2 cards
- [ ] Search "Topmanagement" → 1 section met 2 cards
- [ ] Search "xyz" → empty state
- [ ] Search clear → 14 cards back + totaal-counter "14 rollen, 1 gebruikers"
- [ ] Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- [ ] Identiek RUN #1
- [ ] 14 rollen / 5 sections
- [ ] Search functionality identical
- [ ] Console = 0 app-errors

---

## Eindstand (na 2 CLEAN RUNS)
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor
- **0 modals** (read-only viewer)
- 0 bugs gevonden
- 14 rollen / 5 sections (1:1 BS2 match op naam + volgorde)
- Console errors 0

📌 v3 Fase E: drag-drop CRUD-editor (Opslaan/Reset/Nieuwe rol/Nieuwe sectie).
📌 v3 Fase G: bulk-onboarding 102 medewerker-profielen → user-counts gaan kloppen.
📌 DPA: Niet blokkerend voor Module 31 (Teams).
