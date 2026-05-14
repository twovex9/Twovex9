# Module 35 — Mijn-gegevens LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 35 Mijn-gegevens (mijn-gegevens.html, BS2 /account)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
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

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

### CLEAN RUN #1 (post-PR #134 merge)

- [x] BS1 mijn-gegevens.html laadt: h1="Mijn gegevens" ✅
- [x] **Bug #69 verified live**: topbar link href = "mijn-gegevens.html" (self-reference) + is-active class ✅
- [x] 12 stats renderd met data: NAAM=Sonck, E-MAIL=sonck802@gmail.com, ROL=admin, MEDEWERKER-ID=2bb2755a-..., FUNCTIE=—, FASE=in_dienst, DIENSTVERBAND=Loondienst, NOTITIES/DOCUMENTEN/VERZUIM/PLANNING=0, GEËXPORTEERD OP=22:40:25 ✅
- [x] 10 li-items total (5 AVG-rechten + 5 retention-policies) ✅
- [x] Download JSON button present ✅
- [x] Vernieuwen button present ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Identiek RUN #1: h1="Mijn gegevens", bug69_href="mijn-gegevens.html" ✅
- [x] Grid has data (sonck802 visible) ✅
- [x] **Vernieuwen verified live**: GEËXPORTEERD OP timestamp updated (22:40:46 → 22:40:50) ✅
- [x] 3 sections present ✅
- [x] 5 AVG-rechten + 5 retention-policies li-items ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **0 modals** (read-only inzage)
- Bug #69 (topbar self-reference) verified live in beide runs
- 12 stats + 5 AVG-rechten + 5 retention-policies
- Vernieuwen-button werkt (timestamp re-update)
- Console errors 0

📌 v3 Fase G: active-sessions feature toevoegen (BS2 has, BS1 missing).
📌 DPA: Niet blokkerend voor Module 36 (Manual — laatste module).
