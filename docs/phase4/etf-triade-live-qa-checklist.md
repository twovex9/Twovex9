# ETF Triade — live QA-checklist (web)

> Doel: bevestigen dat de ETF-stijl (richting U) op **elke pagina, elk tabblad, elke modal** klopt — live in productie, ingelogd via de Chrome-extensie.

## Protocol — 2 clean runs

1. Loop elke pagina hieronder af; vink per pagina de 5 punten af.
2. Vind je **één** afwijking → noteer + meld; ná de fix begin je de héle ronde opnieuw.
3. Pas wanneer je **twee volledige rondes zonder enige afwijking** hebt, is de module ✅.

## Per pagina controleren

| # | Check | Verwacht |
|---|---|---|
| 1 | Kleuren | Logo-blauw `#3a8fc4` als accent; **nergens** oud-blauw `#2563eb`; canvas koel-grijs, kaarten zweven |
| 2 | Topbar + sidebar | Identiek aan de rest; actief menu-item mint-getint met lime-stip |
| 3 | Knoppen + pills | Primair = logo-blauw; status-pills lime/mint/amber/rood leesbaar |
| 4 | Modals + slider | Bevestig-modal opent; slider vult **vol logo-blauw** bij 100% |
| 5 | Dark mode | Toggle → ETF Dark; kleuren lichten op, alles leesbaar, niets wit-op-wit |

## Code-niveau (al geborgd, vink ter info)

- [x] 0 oude palet-kleuren in `*.css/*.html/*.js` (geautomatiseerd gescand, 2 clean runs)
- [x] Alle 108 pagina's gerenderd in browser → 0 oude kleuren in computed styles (2 clean runs)
- [x] CI-bewaking blokkeert nieuwe oude kleuren (web + mobiel)

## Pagina's per module (108)

### 🧑‍🦽 Cliënten & zorg (24)

- [ ] `aanmeld-portaal.html` — run1 ☐ · run2 ☐
- [ ] `aanmeldingen.html` — run1 ☐ · run2 ☐
- [ ] `beschikking-detail.html` — run1 ☐ · run2 ☐
- [ ] `beschikkingen.html` — run1 ☐ · run2 ☐
- [ ] `bureau-detail.html` — run1 ☐ · run2 ☐
- [ ] `bureaus.html` — run1 ☐ · run2 ☐
- [ ] `client-detail.html` — run1 ☐ · run2 ☐
- [ ] `clienten.html` — run1 ☐ · run2 ☐
- [ ] `financien-locaties.html` — run1 ☐ · run2 ☐
- [ ] `gemeente-detail.html` — run1 ☐ · run2 ☐
- [ ] `gemeenten.html` — run1 ☐ · run2 ☐
- [ ] `incident-melden.html` — run1 ☐ · run2 ☐
- [ ] `incidenten-analyse.html` — run1 ☐ · run2 ☐
- [ ] `incidenten-categorieen.html` — run1 ☐ · run2 ☐
- [ ] `incidenten.html` — run1 ☐ · run2 ☐
- [ ] `klachten.html` — run1 ☐ · run2 ☐
- [ ] `locatie-detail.html` — run1 ☐ · run2 ☐
- [ ] `locaties.html` — run1 ☐ · run2 ☐
- [ ] `organisatie-detail.html` — run1 ☐ · run2 ☐
- [ ] `organisatie.html` — run1 ☐ · run2 ☐
- [ ] `verbeteringsmaatregelen.html` — run1 ☐ · run2 ☐
- [ ] `wachtlijst.html` — run1 ☐ · run2 ☐
- [ ] `zorgsoort-detail.html` — run1 ☐ · run2 ☐
- [ ] `zorgsoorten.html` — run1 ☐ · run2 ☐

### 🏠 Dashboards & overzicht (11)

- [ ] `audit.html` — run1 ☐ · run2 ☐
- [ ] `beschikkingen-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `clientmodule-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `compliance-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `home.html` — run1 ☐ · run2 ☐
- [ ] `hr-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `incidenten-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `management-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `mobiliteit-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `planner-dashboard.html` — run1 ☐ · run2 ☐
- [ ] `workforce-planning.html` — run1 ☐ · run2 ☐

### ⚙️ Beheer & instellingen (6)

- [ ] `beleid-documenten.html` — run1 ☐ · run2 ☐
- [ ] `beleid.html` — run1 ☐ · run2 ☐
- [ ] `instellingen.html` — run1 ☐ · run2 ☐
- [ ] `invoice-detail.html` — run1 ☐ · run2 ☐
- [ ] `sharepoint.html` — run1 ☐ · run2 ☐
- [ ] `taken.html` — run1 ☐ · run2 ☐

### 👥 Personeel / HR (50)

- [ ] `beschikbaarheid-overzicht.html` — run1 ☐ · run2 ☐
- [ ] `bezetting.html` — run1 ☐ · run2 ☐
- [ ] `compensatie-berekeningen.html` — run1 ☐ · run2 ☐
- [ ] `compensatie-diensttypes.html` — run1 ☐ · run2 ☐
- [ ] `compensatie-feestdagen.html` — run1 ☐ · run2 ☐
- [ ] `compensatie-saldi.html` — run1 ☐ · run2 ☐
- [ ] `competentie-detail.html` — run1 ☐ · run2 ☐
- [ ] `competenties.html` — run1 ☐ · run2 ☐
- [ ] `facturen-alle.html` — run1 ☐ · run2 ☐
- [ ] `facturen-importeren.html` — run1 ☐ · run2 ☐
- [ ] `facturen-indiening.html` — run1 ☐ · run2 ☐
- [ ] `facturen-te-beoordelen.html` — run1 ☐ · run2 ☐
- [ ] `facturen.html` — run1 ☐ · run2 ☐
- [ ] `gebruikers.html` — run1 ☐ · run2 ☐
- [ ] `hr-diensttypes.html` — run1 ☐ · run2 ☐
- [ ] `hr.html` — run1 ☐ · run2 ☐
- [ ] `inwerk-items.html` — run1 ☐ · run2 ☐
- [ ] `loonstroken.html` — run1 ☐ · run2 ☐
- [ ] `medewerker-agenda.html` — run1 ☐ · run2 ☐
- [ ] `medewerker-detail.html` — run1 ☐ · run2 ☐
- [ ] `medewerker.html` — run1 ☐ · run2 ☐
- [ ] `medewerkers-overzicht.html` — run1 ☐ · run2 ☐
- [ ] `mijn-beschikbaarheid.html` — run1 ☐ · run2 ☐
- [ ] `mijn-proforma-facturen.html` — run1 ☐ · run2 ☐
- [ ] `mijn-uren.html` — run1 ☐ · run2 ☐
- [ ] `onboarding-inwerken.html` — run1 ☐ · run2 ☐
- [ ] `onboarding-upload.html` — run1 ☐ · run2 ☐
- [ ] `open-diensten.html` — run1 ☐ · run2 ☐
- [ ] `opleiding-detail.html` — run1 ☐ · run2 ☐
- [ ] `opleidingen.html` — run1 ☐ · run2 ☐
- [ ] `plus-minuren.html` — run1 ☐ · run2 ☐
- [ ] `productie-urenregistratie.html` — run1 ☐ · run2 ☐
- [ ] `rol-detail.html` — run1 ☐ · run2 ☐
- [ ] `rollen.html` — run1 ☐ · run2 ☐
- [ ] `salarisadministratie-exporter.html` — run1 ☐ · run2 ☐
- [ ] `salarishuis-wijzigingsgeschiedenis.html` — run1 ☐ · run2 ☐
- [ ] `salarishuis.html` — run1 ☐ · run2 ☐
- [ ] `teams.html` — run1 ☐ · run2 ☐
- [ ] `uren-budgettering.html` — run1 ☐ · run2 ☐
- [ ] `urendeclaraties.html` — run1 ☐ · run2 ☐
- [ ] `verlof-uitdienst.html` — run1 ☐ · run2 ☐
- [ ] `verlof.html` — run1 ☐ · run2 ☐
- [ ] `verlofstanden.html` — run1 ☐ · run2 ☐
- [ ] `verloftypes.html` — run1 ☐ · run2 ☐
- [ ] `verzuim.html` — run1 ☐ · run2 ☐
- [ ] `werkuren-labels.html` — run1 ☐ · run2 ☐
- [ ] `werkuren.html` — run1 ☐ · run2 ☐
- [ ] `zzp-bureau-facturen.html` — run1 ☐ · run2 ☐
- [ ] `zzp-facturen.html` — run1 ☐ · run2 ☐
- [ ] `zzp-overuren.html` — run1 ☐ · run2 ☐

### 🔐 Auth (2)

- [ ] `contract-sjablonen.html` — run1 ☐ · run2 ☐
- [ ] `login.html` — run1 ☐ · run2 ☐

### 🙋 Mijn-omgeving (medewerker) (5)

- [ ] `contract-tekenen.html` — run1 ☐ · run2 ☐
- [ ] `mijn-gegevens.html` — run1 ☐ · run2 ☐
- [ ] `mijn-uitnodigingen.html` — run1 ☐ · run2 ☐
- [ ] `notifications.html` — run1 ☐ · run2 ☐
- [ ] `onderteken.html` — run1 ☐ · run2 ☐

### 💶 Financiën & facturen (4)

- [ ] `factuur-detail.html` — run1 ☐ · run2 ☐
- [ ] `financien-overhead.html` — run1 ☐ · run2 ☐
- [ ] `zzp-factuur-detail.html` — run1 ☐ · run2 ☐
- [ ] `zzp-reconciliatie.html` — run1 ☐ · run2 ☐

### 📅 Planning (5)

- [ ] `kilometers.html` — run1 ☐ · run2 ☐
- [ ] `km-afstanden.html` — run1 ☐ · run2 ☐
- [ ] `km-afwijkingen.html` — run1 ☐ · run2 ☐
- [ ] `planning-beheer.html` — run1 ☐ · run2 ☐
- [ ] `planning.html` — run1 ☐ · run2 ☐

### 📄 Overig (1)

- [ ] `nieuws.html` — run1 ☐ · run2 ☐

## Mobiel (future-flow-mobile)

Zelfde 5 checks per scherm via de bottom-nav (Home, Agenda, Uren, Nieuws, Taken, Profiel) + login. Globals delen 1-op-1 het web-palet; CI-guard actief.
