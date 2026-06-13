# Module 15 — Cliënten Zorgsoorten LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 15 Cliënten Zorgsoorten (zorgsoorten.html)
**Lockdown-status**: 🔒 30/30 ✅ + 9/9 modal close-ways + ULTRA-DEEP 100% — **wacht op user-override**
**Gestart + voltooid**: 2026-05-14

**Bugs gefixt**:
- **#41** (data): "test" record verwijderd via SQL DELETE
- **#42** (data): "Wlz" → "WLZ" via SQL UPDATE

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/care-types`, h1 "Zorgsoorten", title "Zorgsoorten | Embrace The Future"
- [x] A2. Cliënten-sidebar positie 2 (na Cliënten)
- [x] A3. Toolbar: Zoeken + Gearchiveerd-toggle + Kolommen + Zorgsoort toevoegen
- [x] A4. 2 kolommen: Naam / Tarieftype
- [x] A5. 6 records: Ambulant extern/Ambulant intern/Fasewonen/Gecombineerd/Verblijf en behandeling/WLZ
- [x] A6. Tarieftypes: Week/Uur/Dag (proper case display)
- [x] A7. Multi-select checkbox header
- [x] A8. Rows per page selector (15 default)
- [x] A9. Geen extra filter-chips
- [x] A10. Console errors BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate zorgsoorten.html, title "Zorgsoorten — HR", h1 "Zorgsoorten"
- [x] B2-B3. Scroll OK
- [x] B4. Add-modal × 3 close: X ✅ Escape ✅ Overlay ✅
- [x] B5. Archive-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅
- [x] B6. Purge-modal × 3 close + slider: X ✅ Escape ✅ Overlay ✅ (temp-archive test)
- [x] B7. Search "wlz" → 1 row, restore 6
- [x] B8. Gearchiveerd-toggle werkt
- [x] B9. Kolommen-panel met 2 toggles (Naam, Tarieftype)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `public.zorgsoorten` (PK uuid)
- [x] C2. Kolommen: id/naam/tarieftype/archived/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Index op naam
- [x] C5. Trigger laatst_gewijzigd
- [x] C6. Data: 6 records (na Bug #41 + #42), matches BS2 1:1
- [x] C7. Content spot-check: alle 6 namen match BS2 spelling
- [x] C8. CRUD: add/archive/restore/purge alle werken
- [x] C9. ff:zorgsoorten-updated event op window
- [x] C10. parity.md: 100% pariteit

## D. ULTRA-DEEP — Alle modals + edge cases (✅)

### Modal close-ways = 9/9
- Add modal: X ✅ Escape ✅ Overlay ✅
- Archive modal: X ✅ Escape ✅ Overlay ✅ + slider (huisstijl-conform)
- Purge modal: X ✅ Escape ✅ Overlay ✅ + slider (temp-archive test methode)

### Filters + search
- Search "wlz" → 1 row ✅ (case-insensitive)
- Restore (clear search) → 6 rows ✅
- Gearchiveerd-toggle: 0 archived → 1 (na temp-archive) → 0 (restore)

### Kolommen panel
- 2 toggles (Naam + Tarieftype)
- Default beide ✓ aan
- Toggle uit/aan werkt

### Data pariteit BS2 = BS1
- 6/6 records exact match (na cleanup)
- Naam-spelling identiek
- Tarieftype display "Week/Uur/Dag" (proper case)

---

## Eindstand

- 30/30 ✅
- 9/9 modal × close-ways ✅
- 6/6 data records match BS2 1:1
- Bugs gefixt: **#41** (test record) + **#42** (WLZ spelling)
- Console errors 0

📌 DPA: Niet blokkerend voor Module 16 (Cliënten - Beschikkingen).
