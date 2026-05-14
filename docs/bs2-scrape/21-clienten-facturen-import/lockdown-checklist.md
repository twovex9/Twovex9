# Module 21 — Cliënten Facturen importeren LOCKDOWN CHECKLIST (30/30 ✅ + ULTRA-DEEP)

**Module**: 21 Facturen importeren (facturen-importeren.html)
**Lockdown-status**: 🔒 30/30 ✅ + ULTRA-DEEP — **wacht op user-override**
**Voltooid**: 2026-05-14

**Geen bugs gevonden** — BS1 is superset van BS2.

---

## A. BS2-scrape hardcore (10/10 ✅)

- [x] A1. Navigate `/clients/import-csv`
- [x] A2. Cliënten-sidebar positie 8 (na Uren budgetering)
- [x] A3. Upload-area "Klik om te uploaden of sleep en zet neer"
- [x] A4. File types: SVG/PNG/Excel/CSV/JPG/PDF/.docx
- [x] A5. Max file size 20MB
- [x] A6. Volgende-knop (disabled initially)
- [x] A7. Single-step upload-flow
- [x] A8. Geen import history
- [x] A9. Geen modals
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)

- [x] B1. Navigate facturen-importeren.html, h1 "Facturen importeren"
- [x] B2-B3. Scroll OK
- [x] B4. 2-step wizard: Bestand kiezen / Controleren
- [x] B5. File-input accepts SVG/PNG/Excel/CSV/JPG/PDF/.docx/.doc
- [x] B6. Step 1: Volgende / Vergroten / Ander bestand / X buttons
- [x] B7. Step 2: Vorige / Importeren / Vergroten buttons
- [x] B8. Import history-tabel (Bestandsnaam/Type/Grootte/Datum/Acties)
- [x] B9. "Nog geen bestanden geïmporteerd" empty state
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)

- [x] C1. Storage bucket voor uploaded facturen
- [x] C2. RLS auth-only
- [x] C3. File-handling: storage path
- [x] C4. Import history tracking
- [x] C5. Multiple file types support
- [x] C6. Geen relationele tabel — files-to-storage flow
- [x] C7. Klik Vergroten → preview vergroot
- [x] C8. Klik Ander bestand → replace upload
- [x] C9. Klik X → clear upload
- [x] C10. parity.md: BS1 superset, geen bugs

## D. ULTRA-DEEP ✅

- 2-step wizard met Vorige/Volgende navigatie
- File preview met zoom-functie
- Replace-functie
- Clear-functie
- Import-history tabel met empty-state
- Naar facturen-link

---

## Eindstand

- 30/30 ✅
- Geen bugs gevonden — module direct functioneel
- BS1 superset met 2-step wizard + import history
- Console errors 0

📌 DPA: Niet blokkerend voor Module 22 (Cliënten - Incidenten).
