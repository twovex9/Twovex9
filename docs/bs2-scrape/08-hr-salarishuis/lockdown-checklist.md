# Module 08 — HR Salarishuis LOCKDOWN CHECKLIST (30/30 ✅ + 2 CLEAN RUNS)

**Module**: 08 HR Salarishuis (salarishuis.html + salarishuis-wijzigingsgeschiedenis.html)
**Lockdown-status**: 🔒 30/30 ✅ + 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bevindingen vóór CLEAN RUNS**:
- BS1 salarishuis.html + salarishuis-wijzigingsgeschiedenis.html bestonden al
- **Data-pariteit fix**: BS1 had 27 records (15 legacy "BS2-schaal X" duplicates + 12 originele schaals). Cleanup → 13 records (Schaal 4-14 + stagevergoeding + Schaal 15 toegevoegd) = match BS2.

**2 bugs gefixt via PR #83**:
- #25: Geschiedenis-knop ontbrak in header-actions van salarishuis.html. BS2 toont 'Geschiedenis' link. Fix: `<a href="salarishuis-wijzigingsgeschiedenis.html">` toegevoegd.
- #27: Salarisschaal-modal (sal-modal-schaal) sluit niet via Escape. Modal gebruikt style.display ipv hidden-attr. Fix: keydown listener specifiek voor sal-modal-schaal + fallback.

---

## A. BS2-scrape hardcore (10/10 ✅)

BS2 `/hr/salary-structure`:
- Header buttons: Geschiedenis / Corrigeer salarisschalen / Salarisschaal toevoegen
- 13 schaal-secties: Schaal 4-15 + stagevergoeding
- Per schaal: tabel met salaristredes + bedragen + Acties + "Salaristrede toevoegen"
- Schaal 12 bevat ook "Omvangperiodiek 1" en "Omvangperiodiek 2" extra entries

- [x] A1-A10. Alle BS2 hardcore items getest

## B. BS1-test hardcore (10/10 ✅)

Live test na PR #83.

- [x] B1. Navigate salarishuis.html: "Salarishuis — HR" + 13 schalen
- [x] B2-B3. Scroll OK
- [x] B4. Klik élke knop: Geschiedenis ✅, Corrigeer salarisschalen ✅, Salarisschaal toevoegen ✅, 13 Salaristrede toevoegen buttons
- [x] B5. Modal × 3 close-ways:
  - Salarisschaal toevoegen: X ✅ Escape ✅ (Bug #27 fix) Overlay ✅
- [x] B6. Corrigeer toggle: enters edit-mode → "Corrigeren beëindigen" verschijnt
- [x] B7. E2E: salarishuisDB.refresh + cache-update werken; salaristredes laden uit jsonb 'rows'
- [x] B8. Sub-page: salarishuis-wijzigingsgeschiedenis.html ✅ "Wijzigingsgeschiedenis" h1 + back-btn
- [x] B9. Console: 0 app-errors
- [x] B10. Visuele match BS2 ↔ BS1: identiek (kolommen + per-schaal layout)

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Supabase tabel `salarisschalen` (id text PK) + `salarishuis_wijzigingen` (audit-log uuid PK)
- [x] C2. Kolommen: id/title/rows(jsonb)/sort_order/aanmaakdatum/laatst_gewijzigd
- [x] C3. RLS: auth-only
- [x] C4. Indices: sort_order
- [x] C5. Triggers: laatst_gewijzigd
- [x] C6. Data-pariteit: BS1=BS2=13 schalen ✅ (na cleanup 15 BS2-schaal duplicates + add Schaal 15)
- [x] C7. Content spot-check: Schaal 4 t/m 14 + stagevergoeding + Schaal 15 (empty)
- [x] C8. CRUD via salarishuisDB.refresh werkt
- [x] C9. ff:salarishuis-updated event
- [x] C10. parity.md: 100%

## D. ULTRA-DEEP CLEAN RUNS (2/2 ✅ — ZONDER fix tussendoor)

### CLEAN RUN #1 (vers, na PR #83)
- ✅ Scroll, 13 schalen, 13 tables
- ✅ Geschiedenis-link href = "salarishuis-wijzigingsgeschiedenis.html"
- ✅ Add modal × 3 close-ways (X/Escape/Overlay) - Bug #27 verified
- ✅ Corrigeer toggle (active state)
- ✅ Console = 0 app-errors

### CLEAN RUN #2 (ZONDER fix tussendoor)
- ✅ Identiek aan RUN #1 alle stappen pass

---

## Eindstand

- 30/30 ✅
- 2 CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- 2 bugs gefixt: PR #83 (#25 + #27)
- Data-pariteit BS1=BS2=13 ✅
- Console errors 0
- Wijzigingsgeschiedenis sub-page geverifieerd

📌 DPA: Niet blokkerend voor Module 09 (Fase A).
