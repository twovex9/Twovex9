# v3 Fase H Pass 4 — User-handmatige steekproef

**Status**: 🟡 wacht op user-uitvoering (10 minuten op cut-over-dag)
**Datum opgesteld**: 2026-05-15
**Methode**: 8 willekeurige flows die user (jij) op cut-over-dag handmatig doorloopt

---

## Doel

Pass 1-3 zijn automated/script-based. Pass 4 is **menselijke smoke-test** vlak vóór go-live — een echte gebruiker (jij) doet 8 representatieve flows. Eén ❌ → herstel + Pass 1-3 herhaal.

---

## Flows om handmatig te testen (op cut-over-dag, T-15min)

### Flow 1 — Login + 2FA + Welkom-greeting
- [ ] Open `https://besa-suite.vercel.app`
- [ ] Vul email + wachtwoord in
- [ ] Voer 2FA-code uit jouw authenticator-app
- [ ] Verwacht: land op home.html met "Welkom, [jouw voornaam]" + nieuws-cards

### Flow 2 — Help-button + Helpdesk-info
- [ ] Klik op het ?-icoon rechtsboven
- [ ] Verwacht: modal "Hulp nodig?" met tel + mailto-link + "BS1 verstuurt zelf geen e-mails"
- [ ] Sluit via × / Escape / klik buiten modal

### Flow 3 — Medewerker bewerken
- [ ] Navigeer naar Medewerkers (HR-dropdown → Medewerkers)
- [ ] Klik op een willekeurige medewerker
- [ ] Wijzig één veld (bv. telefoonnummer)
- [ ] Klik opslaan → verwacht success-toast
- [ ] Refresh pagina → wijziging persistent

### Flow 4 — Factuur PDF-export
- [ ] Navigeer naar Facturen → Alle facturen
- [ ] Klik op een factuur → detail-modal
- [ ] Klik "Print" of "PDF exporteren"
- [ ] Verwacht: PDF download / print-dialog opent

### Flow 5 — Cliënt + Beschikking-flow
- [ ] Cliënten → klik willekeurige cliënt
- [ ] Bekijk Beschikkingen-tab → minstens 1 record zichtbaar
- [ ] Klik beschikking → modal opent → fase + tarief zichtbaar

### Flow 6 — Gebruikers-tab als admin
- [ ] Navigeer Organisatie → Gebruikers
- [ ] Verwacht: lijst met 100+ medewerkers
- [ ] Zoek op naam → resultaten filteren
- [ ] Klik "Reset wachtwoord" op een willekeurige medewerker (NIET op jezelf) → bevestig
- [ ] Verwacht: toast "Wachtwoord gereset naar Welkom123. Geef dit mondeling door."

### Flow 7 — Audit-log
- [ ] Navigeer naar Audit
- [ ] Verwacht: lijst met recente acties (incl. die je net deed bij Flow 6)
- [ ] Klik op een entry → detail-modal met actor + target + tijdstip

### Flow 8 — Logout + opnieuw login flow
- [ ] Klik rechtsbovenin op je avatar → Uitloggen
- [ ] Land op login-pagina
- [ ] Klik "Wachtwoord vergeten?" → modal "Gelieve eigenaar/admin/directeur..."
- [ ] Sluit modal
- [ ] Login opnieuw met je credentials + 2FA → terug op home

---

## Manuele steekproef-rapport (in te vullen door user)

| Flow | Pass/Fail | Opmerking |
|---|---|---|
| 1. Login + 2FA + Welkom | ⬜ | |
| 2. Help-button + Helpdesk-info | ⬜ | |
| 3. Medewerker bewerken | ⬜ | |
| 4. Factuur PDF-export | ⬜ | |
| 5. Cliënt + Beschikking | ⬜ | |
| 6. Gebruikers-tab Reset password | ⬜ | |
| 7. Audit-log | ⬜ | |
| 8. Logout + forgot-password modal + re-login | ⬜ | |

**Pass-criterium**: 8/8 = ✅ → groen licht productie.
Bij elke ❌ → fix-PR + herhaal Pass 1-3 + Pass 4 opnieuw.

---

## Status

Pass 4 wacht op cut-over-moment. Tot dan:
- Pass 1-3 zijn ✅ GREEN
- Productie-launch is functioneel klaar (zie 99-v3-eindrapport.md)
- Alle bug-fixes gemerged (#75-#82 + alle Fase A/E bugs)
- Mass-mail template klaar voor verzending op cut-over-dag
- Pre-launch cleanup-script klaar als safety-net
