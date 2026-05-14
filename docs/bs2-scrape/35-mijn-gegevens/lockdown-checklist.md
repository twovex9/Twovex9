# Module 35 — Mijn-gegevens LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 35 Mijn-gegevens (mijn-gegevens.html, BS2 /account)
**Lockdown-status**: 🟡 30/30 ✅ — **wacht op merge + 2 HARDCORE CLEAN RUNS post-merge**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#69** (UI): topbar "Mijn gegevens"-link wees naar instellingen.html ipv self-reference → fix naar mijn-gegevens.html

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /account (via user-menu "Mijn profiel"), h1 = "Jason Sonck"
- [x] A2. Title: "account | Embrace The Future"
- [x] A3. Avatar "JS" + naam-heading
- [x] A4. Persoonlijke gegevens form: Voornaam / Achternaam / E-mailadres / Telefoonnummer + Save
- [x] A5. Actieve sessies sectie met device-lijst (Chrome / Mobiele app)
- [x] A6. Per session: device-naam + IP + last-active datum
- [x] A7. "Uitloggen op alle andere apparaten"-button
- [x] A8. Sessions sorted DESC op last-active
- [x] A9. Mobiele app als aparte device-type
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate mijn-gegevens.html, h1 = "Mijn gegevens"
- [x] B2. Title: "Mijn gegevens — GDPR"
- [x] B3. Minimalist topbar (Home + Mijn gegevens only) — design intent voor GDPR-focus
- [x] B4. **Bug #69 fix**: topbar "Mijn gegevens"-link href = mijn-gegevens.html (self-reference)
- [x] B5. 12-stat grid: NAAM/E-MAIL/ROL/MEDEWERKER-ID/FUNCTIE/FASE/DIENSTVERBAND/NOTITIES/DOCUMENTEN/VERZUIM/PLANNING/GEËXPORTEERD OP
- [x] B6. Sectie 2: 5 AVG-rechten (Art. 15/16/17/20/21)
- [x] B7. Sectie 3: 5 retention-policies (Planning/Audit/Notificaties/Personeel/Verzuim)
- [x] B8. Download JSON-button visible
- [x] B9. Vernieuwen-button werkt → re-fetch + update GEËXPORTEERD OP
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. `public.profiles` (1 record, basis voor profile-data)
- [x] C2. Helper-tabellen: medewerkers + 4 sub-tabellen voor counts
- [x] C3. SQL-functie `gdpr_retention_run_v1()` voor automatische retention
- [x] C4. RLS: auth-only, user kan alleen eigen data zien
- [x] C5. Stats live-berekend (geen cache, dus altijd up-to-date)
- [x] C6. JSON-download = client-side blob (`URL.createObjectURL`)
- [x] C7. AVG-rechten + retention statisch HTML (geen DB-content)
- [x] C8. Geen modals (read-only inzage)
- [x] C9. v3 Fase G deferred: active-sessions feature (BS2-only)
- [x] C10. parity.md: BS1 is bewust GDPR-focus, niet profile-edit mirror

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor

### CLEAN RUN #1 — WACHT OP MERGE
- [ ] BS1 mijn-gegevens.html laadt: h1="Mijn gegevens"
- [ ] **Bug #69 verified live**: topbar "Mijn gegevens"-link href = mijn-gegevens.html (geen redirect naar instellingen)
- [ ] 12 stats renderd met data (NAAM=Sonck, E-MAIL=sonck802@gmail.com, etc.)
- [ ] 5 AVG-rechten li-items
- [ ] 5 retention-policies li-items
- [ ] Download JSON button present
- [ ] Vernieuwen button werkt → GEËXPORTEERD OP timestamp update
- [ ] Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- [ ] Identiek RUN #1
- [ ] Topbar link self-reference verified
- [ ] Console = 0 app-errors

---

## Eindstand (na 2 CLEAN RUNS)
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor
- **0 modals** (read-only inzage)
- Bug #69 (topbar self-reference) verified live
- 12 stats + 5 AVG-rechten + 5 retention-policies
- Console errors 0

📌 v3 Fase G: active-sessions feature toevoegen (BS2 has, BS1 missing).
📌 DPA: Niet blokkerend voor Module 36 (Manual).
