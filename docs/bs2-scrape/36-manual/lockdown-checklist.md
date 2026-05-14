# Module 36 — Manual LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 36 Manual (/manual op BS2, **niet aanwezig in BS1 by design**)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**: GEEN — Module 36 bestaat bewust niet in BS1 per user-keuze #7 ("GEEN documentatie — baas wordt zelf eigenaar/admin"). v3 Fase G.8 voegt helpdesk-link toe.

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /manual → redirects to /manual/authentication/sign-in
- [x] A2. Title: "Embrace The Future"
- [x] A3. h1: "Handleiding"
- [x] A4. Sidebar met 10 secties: Authenticatie / Gebruikersbeheer / Cliënt / HR / Organisatie / Beleid / Taken / Audit Logs / Planning / Tijdregistratie
- [x] A5. Authenticatie heeft 3 sub-pages: Inloggen / Wachtwoord Reset Aanvragen / Wachtwoord Resetten
- [x] A6. Per sub-page: tekst-introductie + video-embed
- [x] A7. Default-page: Inloggen
- [x] A8. Video-titel "Bekijk de video demonstratie voor een visuele gids"
- [x] A9. Alle 10 secties zichtbaar in sidebar
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Geen handleiding.html / manual.html in BS1 codebase (`ls handleiding*.html manual*.html` = niets)
- [x] B2. Geen /manual route geconfigureerd
- [x] B3. Help-button in topbar bestaat (visual placeholder, non-functional)
- [x] B4. Geen documentatie-link in topbar of sidebar
- [x] B5. user-keuze #7 vastgelegd in v3-plan: "GEEN documentatie"
- [x] B6. Helpdesk-info in v3 Fase G.8 plan (toekomstige modal)
- [x] B7. Help-button placeholder kan in Fase G.8 worden geactiveerd
- [x] B8. Baas/eigenaar wordt admin via existing rollen-structuur (Module 30)
- [x] B9. Bestaande UI is self-explanatory door BS2-parity
- [x] B10. Console: 0 app-errors (geen handleiding code)

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Geen tabel `public.manual_*` of `public.help_*` in DB
- [x] C2. Geen migrations voor handleiding-data
- [x] C3. Geen `manual-data.js` data-laag
- [x] C4. Bewuste keuze om geen video-storage te gebruiken
- [x] C5. Documentatie-rol via existing admin-rol (Module 30)
- [x] C6. Geen audit-log voor handleiding-views (geen handleiding immers)
- [x] C7. v3 Fase G.8 zal helpdesk-contactinfo opslaan in Instellingen
- [x] C8. parity.md documenteert bewuste afwijking van BS2
- [x] C9. Geen open items voor Module 36 (closed by design)
- [x] C10. Eindrapport-status: Module 36 = bewust skip

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

**Test methode**: verifieer dat BS1 geen handleiding-route heeft + Help-button placeholder werkt zonder errors.

### CLEAN RUN #1

- [x] BS1 home.html laadt zonder handleiding-link in navigation ✅
- [x] Geen `manual.html` / `handleiding.html` file in repo ✅
- [x] Help-button in topbar present (placeholder) ✅
- [x] Help-button click veroorzaakt geen JS-errors (non-functional placeholder) ✅
- [x] Geen broken-link redirects naar non-existent manual ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Identiek RUN #1: geen handleiding-page ✅
- [x] Help-button placeholder consistent op alle pagina's ✅
- [x] Geen v3 Fase G.8 features prematuur geactiveerd ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **0 bugs** (module bestaat bewust niet in BS1)
- user-keuze #7 nageleefd: GEEN documentatie
- v3 Fase G.8 helpdesk-modal staat in plan voor go-live

📌 **Module 36 is de LAATSTE module van v3 Fase A**. Alle 36 BS2-modules nu gescraped + gedocumenteerd + gefixed waar nodig.
📌 v3 Fase A → **VOLLEDIG VOLTOOID** 🎉
📌 Volgende fase: v3 Fase B (Data-scrape via BS2-snippet)
