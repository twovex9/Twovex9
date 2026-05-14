# Module 13 — HR Nieuws LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS + ULTRA-DEEP)

**Module**: 13 HR Nieuws (nieuws.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS ZONDER fix tussendoor + ULTRA-DEEP 100% — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bugs gefixt**:
- **#35** (data): 12 "Gepubliceerd" + 3 "Published" → 15× "Published" via Supabase UPDATE
- **#37** (UI): Meer-opties popover in news-edit-modal geïmplementeerd (Archiveren / Herstellen / Definitief verwijderen)

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/hr/announcements`, title "Nieuws | Embrace The Future", h1 "Nieuws"
- [x] A2. Sidebar Nieuws is laatste HR-item
- [x] A3. Toolbar: Zoeken + Gearchiveerd-toggle + Kolommen + Nieuws toevoegen
- [x] A4. Tabel 4 cols: select / Titel / Status / Aanmaakdatum (3 sortable)
- [x] A5. Status pills: alle "Published" (15 records)
- [x] A6. Klik op titel → detail-page `/hr/announcements/{id}/details`
- [x] A7. Detail-page: Naam + Inhoud + Publiceer + Wijzigingen opslaan
- [x] A8. Geen tabs/chips, geen extra filter
- [x] A9. Pagination footer: "15 of 15 total" + Rows per page
- [x] A10. Console errors BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate verzuim.html, title "Nieuws — HR", h1 "Nieuws"
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close-ways: X ✅ Escape ✅ Overlay ✅
- [x] B5. Edit-modal: Terug ✅ Escape ✅ Overlay ✅ (geen X — design-choice)
- [x] B6. Edit-modal Meer-opties popover werkt na Bug #37 fix
- [x] B7. Delete-modal × 3 close-ways + slider-confirm
- [x] B8. Purge-modal × 3 close-ways + slider-confirm
- [x] B9. Search + Gearchiveerd-toggle + Kolommen + Sort (asc/desc/hide) werken
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.nieuws`
- [x] C2. Kolommen: id/titel/status/auteur/inhoud/image/image2/archived/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Index op aanmaakdatum (sortering)
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 15 records (alle status="Published" na Bug #35 fix)
- [x] C7. Content spot-check: 15 titels matchen BS2
- [x] C8. CRUD: add/edit/archive/restore/purge alle werken
- [x] C9. besa:nieuws-updated event op window
- [x] C10. parity.md: 100% functioneel + 2 bugs gefixt

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ ZONDER fix tussendoor)

### CLEAN RUN #1 (post-PR #98 merge, fresh)
- ✅ Bug #35 verify: 15/15 records status="Published"
- ✅ Bug #37 verify: popover opent + 1 item "Archiveren" (active state)
- ✅ Popover sluit via outside-click + Escape
- ✅ h1="Nieuws", title="Nieuws — HR", sidebar Nieuws active
- ✅ topbar Verlof = 0
- ✅ Add-modal × 3 close: X ✅ Escape ✅ Overlay ✅
- ✅ Edit-modal × 3 close: Terug ✅ Escape ✅ Overlay ✅
- ✅ Delete-modal × 3 close + slider (0-100): X ✅ Escape ✅ Overlay ✅
- ✅ Search "Zaffier": 10→2 rows ✅, restore: 10
- ✅ Gearchiveerd-toggle: 0 archived rows
- ✅ Sort Asc: First "Afscheid van Jamilla"
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek RUN #1 + extra:
  - Sort Desc: First "Wijzigingen binnen HR, verzuim"
  - Sort Hide: Titel-kolom verbergt (kan via Kolommen-panel weer aan)
  - Rows-per-page selector: 10/15/30/40/50 opties beschikbaar
  - Kolommen panel: 3 toggles (Titel/Status/Aanmaakdatum)
  - **ARCHIVED state popover (Bug #37 full coverage)**:
    - Tijdelijk record archived → re-open via title-link → klik Meer-opties
    - Popover toont 2 items: "Herstellen" (non-danger) + "Definitief verwijderen" (red danger)
    - Restore + cleanup: 0 archived records final state
- ✅ Console = 0 app-errors

---

## E. ULTRA-DEEP final 100% check

### Sidebar volgorde (matches BS2)
```
0: Medewerkers (link)
1: Competenties (link)
2: Opleidingen (link)
3: Locaties (link)
4: Salarishuis (group, collapsed default)
5: Bureau's (link)
6: Salarisadministratie (link)
7: Verlof (group, collapsed default)
8: Compensatie (group, BS1-only — 4 sub-items)
9: Verzuim (link, top-level) ← Bug #33 fix
10: Nieuws (link, top-level, ACTIVE op nieuws.html)
```

### Cross-page sidebar consistency (4 pages tested)
- index.html / competenties.html / verlof.html / verzuim.html
- ✅ Nieuws is top-level overal
- ✅ Verzuim is top-level overal
- ✅ verzuim.html: Compensatie group collapsed (Bug #34 fix nog steeds OK)

### Data
- ✅ 15 records totaal, 15 active, 0 archived
- ✅ Alle statussen "Published" (Bug #35 normalisatie nog steeds OK)

### Visible headers (Kolommen panel test cycle)
- ✅ Na hide+restore: 5 headers visible (select / Titel / Status / Aanmaakdatum / Acties)

### Bug #37 deep verification — Popover state-conditioned items
- ✅ Active state: 1 item "Archiveren"
- ✅ Archived state: 2 items "Herstellen" + "Definitief verwijderen" (danger styling)
- ✅ Sluit via outside-click
- ✅ Sluit via Escape (modal blijft open)
- ✅ Css: --shadow-pop, --r-md, --fill-hover, --red-soft (huisstijl-conform)

---

## Eindstand

- 30/30 ✅ (A+B+C)
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- ULTRA-DEEP final 100% check ✅
- Bugs gefixt: **#35** (data, 15/15 "Published" via Supabase) + **#37** (UI, Meer-opties popover)
- Console errors 0
- Sidebar volgorde 100% conform BS2 HR-volgorde + cross-page consistent
- 15 records data-pariteit met BS2

📌 DPA: Niet blokkerend voor Module 14 (Fase A — Cliënten overview).
