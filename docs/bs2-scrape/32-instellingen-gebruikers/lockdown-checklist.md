# Module 32 — Instellingen / Gebruikers LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 32 Instellingen / Gebruikers (instellingen.html Gebruikers-tab, BS2 /settings/users)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**: GEEN — Module 32 had 0 bugs, BS1 reeds 100% functionele pariteit met BS2 (read-only viewer).

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /settings (auto-redirect /settings/users), h1 = "Gebruikers"
- [x] A2. Title: "Gebruikers | Embrace The Future"
- [x] A3. 3 sub-tabs: Gebruikers / Entiteiten / Notificaties
- [x] A4. Toolbar: Kolommen / Gebruiker toevoegen / Gearchiveerd
- [x] A5. Table cols (5): Naam / E-mailadres / Rollen / Status / Aanmaakdatum
- [x] A6. 120 users totaal, 15 per page, 8 pagina's
- [x] A7. Multi-role display ("Medewerker, Finance" voor Dennis Van Deelen)
- [x] A8. Status badge ("Actief" voor allemaal)
- [x] A9. Aanmaakdatum DESC sort (Rianne Hoppen 06-05-2026 nieuwste)
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate instellingen.html, h1 = "Instellingen"
- [x] B2. 5 tabs visible: Mijn profiel / Gebruikers / Mijn notificaties / Notificatietypes / Entiteiten
- [x] B3. Klik Gebruikers-tab → panel `#inst-panel-gebruikers` shows
- [x] B4. Table cols (5) match BS2: Naam / E-mailadres / Rollen / Status / Aanmaakdatum
- [x] B5. 1 user visible (test-admin: "(geen naam)" / sonck802@gmail.com / admin / Actief / 8-5-2026)
- [x] B6. Count display: "1 van 1"
- [x] B7. Search "sonck" → "1 van 1" / Search "xyz" → "0 van 1" / Clear → "1 van 1"
- [x] B8. Kolommen-kiezer: 4 toggleable (E-mailadres/Rollen/Status/Aanmaakdatum), Naam skipToggle
- [x] B9. Toggle Rollen OFF → TH + TD both hidden (data-col on both ✅)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabel `public.profiles` (1 record)
- [x] C2. Kolommen: id (uuid → auth.users) / email / voornaam / achternaam / rol (text) / medewerker_id / aanmaakdatum / laatst_gewijzigd / rol_id (uuid → org_roles)
- [x] C3. RLS: auth-only, admin-only voor rol-wijziging
- [x] C4. 1-op-1 met `auth.users` via auto-create trigger
- [x] C5. Status "Actief" hardcoded green-pill (geen archived in profile-tabel)
- [x] C6. profilesDB data-laag: getAllSync / refresh / getCurrentSync / update / isAdmin
- [x] C7. ff:profile-updated event op window → re-render
- [x] C8. TD-cellen hebben `data-col` attribuut (Bug #64-pattern al goed)
- [x] C9. User-count gap (BS2 120 vs BS1 1) is v3 Fase G item, niet Module 32 bug
- [x] C10. parity.md: 100% functionele pariteit + BS1 superset (5 tabs incl. Mijn profiel + Mijn notificaties)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

### CLEAN RUN #1

- [x] BS1 instellingen.html laadt: 5 tabs visible (Mijn profiel / Gebruikers / Mijn notificaties / Notificatietypes / Entiteiten) ✅
- [x] Klik Gebruikers-tab → 1 row visible ✅
- [x] First row: ["(geen naam)", "sonck802@gmail.com", "admin", "Actief", "8-5-2026"] ✅
- [x] Count: "1 van 1" ✅
- [x] Search "sonck" → "1 van 1" ✅
- [x] Search "xyz" → "0 van 1" ✅
- [x] Clear → "1 van 1" ✅
- [x] **Kolommen-kiezer "Rollen" toggle**: TH hidden ✅ + TD hidden ✅
- [x] Toggle back ON → visible ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Identiek RUN #1: 1 row, "1 van 1", sonck802@gmail.com email ✅
- [x] Search "admin" → "1 van 1" ✅
- [x] **Kolommen-kiezer "Aanmaakdatum" toggle**: TH hidden ✅ + TD hidden ✅
- [x] Alle 5 tabs switch correctly (profiel/gebruikers/mijn-notificaties/notificaties/entiteiten panels visible) ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **0 modals** in Module 32 scope (read-only viewer, CRUD = Supabase Auth)
- 0 bugs gevonden
- 1 user visible (test-admin, "(geen naam)" placeholder voor lege voornaam/achternaam)
- 5 tabs functioneel (BS1 superset)
- Console errors 0

📌 v3 Fase G: bulk-onboarding 102 medewerker-profielen via `scripts/onboard-bs2-employees.mjs` → user-count gaat naar 120 (BS2 match).
📌 v3 Fase G: Admin-only Gebruikersbeheer-pagina (add/edit/deactivate/reset-password/reset-2FA).
📌 v3 Fase G: 2FA enrollment-wizard + must_change_password flag.
📌 DPA: Niet blokkerend voor Module 33 (Entiteiten).
