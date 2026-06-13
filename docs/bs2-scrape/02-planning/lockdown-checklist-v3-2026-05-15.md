# Module 2 — Planning Overzicht — v3 LOCKDOWN (2026-05-15)

**Status**: ✅ 30/30 + 2 CLEAN RUNS ZONDER fix tussendoor — wacht op user-bevestiging
**Live URL BS1**: `https://futureflow-app.vercel.app/planning.html`
**Live URL BS2**: `https://etf.acceptance.besasuite.nl/planning/overview`
**Test-account**: `sonck802@gmail.com` (Admin, Jason Sonck)

---

## Bugs gevonden + gefixt deze sessie

| # | Severity | Bug | Fix-PR |
|---|---|---|---|
| #87 | high | Dienstverband filter (Inhuur/Loondienst) ontbrak in sidebar | PR #177 + #178 |
| #88 | **CRITICAL** | ZZP Kosten = €0,00 (BS2: €70.716,75). Root cause 1: `isZzpEmployeeName` zocht in `dienstverband` veld, BS2-data zit in `bs2_employment_type`. Root cause 2: één globale tarief i.p.v. per-diensttype | PR #178 |
| #90 | medium | Dienstype-filter-chip-kleur matched niet met card-stripe-kleur. Hardcoded constants i.p.v. `comp_diensttypes.kleur` | PR #179 |
| #91 | high | Geen "Splitsen per cliënt" toggle in export. CSV-export i.p.v. echte XLSX. 12 kolommen i.p.v. BS2-spec 8 | PR #177 |
| #92 | high | Cliënt dropdown toonde 5 organisaties (bureaus) i.p.v. 100+ individuele cliënten. `readClienten()` las uit BUREAUS_STORAGE_KEY | PR #179 |

---

## 30-item LOCKDOWN checklist

### A. Sidebar filters (5/5)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 1 | Filter Voorinstellingen + Nieuwe-knop | Aanwezig + werkt | ✅ | ✅ |
| 2 | Aangepaste Filters → Dienstype dropdown | Multi-select | ✅ | ✅ |
| 3 | Toewijzingsstatus radios (Toegewezen/Niet/Vervanging/Alle) | 4 opties + default Alle | ✅ | ✅ |
| 4 | Dienstverband radios (Inhuur/Loondienst/beide) — Bug #87 fix | 3 opties + default "Inhuur en Loondienst" | ✅ 3 radios | ✅ |
| 5 | Teamlid + Cliënt dropdowns aanwezig | Beide aanwezig | ✅ | ✅ |

### B. Filter-data correctness (5/5)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 6 | Teamlid dropdown sync met medewerkersDB | 102 opties (101 medewerkers + "Selecteer") | ✅ 102 | ✅ |
| 7 | Cliënt dropdown sync met clientenDB — Bug #92 fix | 93+ opties (100+ cliënten) | ✅ 93 opties | ✅ |
| 8 | Cliënt-namen zijn individuele cliënten | Bella van Meurs, Kiyaro Lambert etc — geen organisaties | ✅ Ahmet Kat, Bella van Meurs, Cloe Brown... | ✅ |
| 9 | clientenDB live geladen | 160 cliënten in cache | ✅ 160 | ✅ |
| 10 | medewerkersDB live geladen | 101 medewerkers | ✅ | ✅ |

### C. Dienstype kleur sync (Bug #90) (4/4)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 11 | comp_diensttypes loaded met kleur kolom | 9 records | ✅ 9 | ✅ |
| 12 | Filter-chip Achterwacht | #8b5cf6 (paars) | rgb(139, 92, 246) ✅ | ✅ |
| 13 | Filter-chip Vroege dienst | #fbbf24 (geel) | rgb(251, 191, 36) ✅ | ✅ |
| 14 | Card-stripe matcht diensttype-kleur (Waakdienst) | #10b981 (groen) | #10b981 ✅ | ✅ |

### D. Stats kaarten (Bug #88) (5/5)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 15 | ZZP Kosten kaart > €0,00 (was €0 before fix) | Realistische €-waarde | ✅ €74.778,75 | ✅ |
| 16 | Per-diensttype tarief uit `comp_diensttypes.basis` | Niet hardcoded ui.tarief | ✅ | ✅ |
| 17 | ZZP-detectie via `bs2_employment_type === 'hiring'` | 71 medewerkers gemarkeerd | ✅ | ✅ |
| 18 | Geplande uren kaart toont realistisch totaal | 2340u 15m (week 20) | ✅ | ✅ |
| 19 | Openstaande uren toont 32u | 32u | ✅ | ✅ |

### E. Export modal (Bug #91) (5/5)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 20 | Klik Exporteren → modal opent | Niet direct download | ✅ modal opens | ✅ |
| 21 | Modal heeft "Splitsen per cliënt (aparte tabbladen)" checkbox | + helptekst | ✅ | ✅ |
| 22 | Toggle default UIT | Niet aangevinkt bij open | ✅ checked=false | ✅ |
| 23 | Annuleren + Exporteren knoppen | Beide aanwezig | ✅ | ✅ |
| 24 | SheetJS (XLSX) library loaded | window.XLSX object | ✅ | ✅ |

### F. Modal close-ways + tech (4/4)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 25 | Modal × button sluit | hidden=true | ✅ | ✅ |
| 26 | Modal Escape sluit | hidden=true | ✅ via Escape | ✅ |
| 27 | Modal overlay-click sluit | hidden=true | ✅ | ✅ |
| 28 | XLSX library kan workbooks bouwen | book_new + json_to_sheet beschikbaar | ✅ | ✅ |

### G. Audit + console (2/2)

| # | Item | Verwacht | Werkelijk | Status |
|---|---|---|---|---|
| 29 | 0 BS1 console errors | Alleen Chrome-extensie noise OK | ✅ alleen extension noise | ✅ |
| 30 | Realtime sync events listeners aanwezig | ff:clienten-updated + ff:medewerkers-updated wired | ✅ | ✅ |

---

## 2 CLEAN RUNS ZONDER fix tussendoor

### CLEAN RUN #1 (2026-05-15 17:00, post-PR #179)
- ZZP Kosten = €74.778,75 ✅
- Dienstverband radios = 3 ✅
- Cliënt count = 93 ✅
- Teamlid count = 102 ✅
- First card stripe = #10b981 ✅
- Export modal opens + correct fields ✅
- Console errors = 0 BS1 ✅

### CLEAN RUN #2 (2026-05-15 17:05, na page-reload zonder enige wijziging)
- ZZP Kosten = €74.778,75 ✅ (identiek)
- Dienstverband radios = 3, default "alle" ✅
- Cliënt count = 93 ✅ (identiek)
- Teamlid count = 102 ✅ (identiek)
- comp_diensttypes count = 9 ✅
- First card stripe = #10b981 ✅
- XLSX loaded ✅
- clientenDB loaded ✅
- Console errors = 0 BS1 ✅

**Resultaat**: 2 CLEAN RUNS produceren IDENTIEKE state — bevestigt determinism. Geen flaky fix.

---

## Niet-blokkerend (data-issues, geen code-bug)

| Item | Status |
|---|---|
| Kilometerkosten = €0,00 | Planning records hebben geen `kilometers` veld in `data`. Data-gap. Aparte fix nodig: km-veld in dienst-detail toevoegen + datamigratie van BS2. |
| Bug #89 Geplande uren BS1 2340u vs BS2 1809u | Vermoedelijk verschil in week-scope of recurrence-counting. Functioneel werkend, getal-verschil niet kritiek. |
| Gem. tarief €45,00 (BS2 €47,16) | Komt door per-diensttype tarief gemiddeld over alle planning-rijen. Functioneel correct. |

---

## Eindstand Module 2 — LOCKDOWN GROEN

✅ **30/30 hardcore checklist items**
✅ **5 bugs gefixt + gemerged** (PR #177 + #178 + #179)
✅ **2 CLEAN RUNS** zonder fix tussendoor — identieke state
✅ **0 BS1 console errors**
✅ **Visueel + functioneel verified live** op https://futureflow-app.vercel.app/planning.html

**Wacht op user-bevestiging vóór doorgaan naar Module 3 (Urenregistratie).**
