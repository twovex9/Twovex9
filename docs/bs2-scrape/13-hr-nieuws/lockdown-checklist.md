# Module 13 — HR Nieuws LOCKDOWN CHECKLIST

**Module**: 13 HR Nieuws (nieuws.html)
**Lockdown-status**: 🟡 IN-PROGRESS — Bugs #35 + #37 fixes applied, wacht op merge + CLEAN RUNS
**Gestart**: 2026-05-14

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

## D. ULTRA-DEEP CLEAN RUNS (pending — na PR-merge)

### CLEAN RUN #1
- pending

### CLEAN RUN #2 (ZONDER fix tussendoor)
- pending

---

## Eindstand

- Pending na PR-merge:
  - 30/30 ✅
  - 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor
  - Bug #35 + #37 verified
  - Console errors 0
- User-override afwachten

📌 DPA: Niet blokkerend voor Module 14 (Fase A).
