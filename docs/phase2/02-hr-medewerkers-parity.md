# Phase 2 — Sectie 2: HR / Medewerkers (parity check)

**Datum**: 2026-05-12
**Status**: ✅ Compleet — geen build-werk nodig

## Doel
Parity-check tussen BS2 `/hr/employees` en BS1 `index.html` (medewerkers-lijst). BS1 is ground-truth voor stijl, dus we kijken alleen of er functionele gaps zijn.

## BS2 sub-page URLs ontdekt (handig voor latere secties)

| BS2 sub-tab | URL |
|---|---|
| Medewerkers | `/hr/employees` |
| Competenties | `/hr/competencies` |
| Opleidingen | `/hr/certifications` |
| Locaties | `/hr/locations` |
| Salarishuis | `/hr/salary-structure` |
| Bureau's | `/hr/agencies` |
| Salarisadministratie | `/hr/monthly-payroll` |
| Verlof | (geen href visible) |
| Verzuim | `/hr/all-sickness` |
| Nieuws | `/hr/announcements` |

## Kolommen-vergelijking

| BS1 (uit `index.html`) | BS2 | Match |
|---|---|---|
| Avatar | — | BS1 extra |
| Voornaam | Voornaam | ✅ |
| Achternaam | Achternaam | ✅ |
| E-mailadres | E-mailadres | ✅ |
| Tel. | Tel. | ✅ |
| Fase | Fase | ✅ |
| Dienstverband | Dienstverband | ✅ |
| Functie | — | BS1 extra |
| Opleiding | — | BS1 extra |
| Werktype | Werktype | ✅ |
| Startdatum | Startdatum | ✅ |
| Periodieke maand | Periodieke maand | ✅ |
| Einde contract | Einde contract | ✅ |
| # contracten | # contracten | ✅ |
| Contracttype | Contracttype | ✅ |
| Uit dienst | Uit dienst | ✅ |
| Laatst gewijzigd | Laatst gewijzigd | ✅ |

**BS1 heeft 17 kolommen, BS2 heeft 14 default-zichtbaar.** BS1 is een superset.

## Filters-vergelijking

| Filter | BS1 | BS2 |
|---|---|---|
| Search box | ✅ | ✅ |
| Gearchiveerd toggle (yellow) | ✅ | ✅ |
| Vereist actie toggle (red) | ✅ | ✅ |
| Locatie chip | ✅ | ✅ |
| Bureau chip | ✅ | ✅ |
| Contracttype chip | ✅ | ✅ |
| Fase chip | ✅ | ✅ |
| Dienstverband chip | ✅ | ✅ |
| Competenties chip | ✅ | ✅ |
| Functie chip (zoekbaar dropdown) | ✅ | ✅ |
| Opleiding chip (zoekbaar dropdown) | ✅ | ✅ |

**100% filter parity.** ✅

## Actions-vergelijking

| Action | BS1 | BS2 |
|---|---|---|
| Kolommen (kolomkiezer) | ✅ | ✅ |
| Exporteren | ✅ (ff-export.js) | ✅ |
| + Medewerker toevoegen | ✅ | ✅ |

## HR sub-nav (sidebar) vergelijking

| Tab | BS1 sidebar | BS2 sidebar |
|---|---|---|
| Medewerkers | ✅ (is-active) | ✅ |
| Competenties | ✅ | ✅ |
| Opleidingen | ✅ | ✅ |
| Locaties | ✅ | ✅ |
| Salarishuis (+ Wijzigingsgeschiedenis) | ✅ groep | ✅ flat |
| Bureau's | ✅ | ✅ |
| Salarisadministratie | ✅ | ✅ |
| Compensatie (Saldi/Berekeningen/Feestdagen/Diensttypes/Verzuim) | ✅ subgroep | — |
| Verlof | — (zit in top-nav → werkruimte.html#verlof) | ✅ |
| Verzuim | — (zit onder Compensatie) | ✅ standalone |
| Nieuws | ✅ | ✅ |

**Gaps**:
- 🟡 BS1 mist Verlof als standalone HR-sidebar tab (zit in top-nav)
- 🟡 BS1 mist Verzuim als standalone tab (zit onder Compensatie sub-groep)
- ⚪ BS2 mist Compensatie (Saldi/Berekeningen) — BS1-specifieke uitbreiding

## Data-vergelijking

| Aspect | BS1 productie | BS2 acceptance |
|---|---|---|
| Aantal medewerkers | **98** (`list_tables` `public.medewerkers.rows`) | 0 (`50 of 0 total.`) |

**BS1 heeft echte productie-data. BS2 acceptance env is leeg.** Geen data-porten nodig.

## Schema-vergelijking

BS1 `public.medewerkers` velden (uit verbose `list_tables`):
- `id`, `voornaam`, `achternaam`, `email`, `fase` (default 'In dienst')
- `dienstverband`, `functie`, `archived`, `aanmaakdatum`, `laatst_gewijzigd`
- `data` (jsonb) — alle overige velden via Stage 6 jsonb-pattern

BS2 toont in kolommen extra: tel, werktype, startdatum, periodieke_maand, einde_contract, n_contracten, contracttype, uit_dienst. Volgens BS1 werkpatronen 6b (Stage 6) zitten deze in `medewerkers.data` jsonb i.p.v. losse kolommen. **Schema is functioneel equivalent.**

## Conclusie

✅ **BS1 medewerkers is op of boven BS2 parity.** Geen build-werk nodig.

Mogelijke kleine uitbreidingen voor later (laag prio):
1. Verlof als standalone HR-sidebar tab (i.p.v. top-nav)
2. Verzuim als top-level HR-tab (i.p.v. onder Compensatie)
3. Detail-view en add-modal in BS2 nog niet vergeleken (BS2 heeft 0 medewerkers, dus niet te zien zonder interactie)

## Code-wijzigingen
**Geen.** Parity is voldoende.
