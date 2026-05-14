# Module 21 — Facturen importeren — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Facturen importeren" | (geen) | ✅ | BS1+ |
| Sidebar item Facturen importeren | ✅ | ✅ | ✅ |
| Upload-area "Klik om te uploaden..." | ✅ | ✅ | ✅ |
| File-types accepted | csv/xlsx/etc | ✅ identiek + .doc/.docx | ✅ |
| Max 20MB | ✅ | ✅ | ✅ |
| Volgende-knop | ✅ | ✅ #fi-next-1 | ✅ |
| 2-step wizard (Bestand kiezen / Controleren) | ❌ | ✅ | BS1+ |
| Vergroten-knop | ❌ | ✅ #fi-zoom-btn | BS1+ |
| Ander bestand-knop | ❌ | ✅ #fi-replace-btn | BS1+ |
| Clear-X knop | ❌ | ✅ #fi-clear-btn | BS1+ |
| Step 2: Vorige + Importeren | ❌ | ✅ | BS1+ |
| Import history-tabel | ❌ | ✅ Bestandsnaam/Type/Grootte/Datum/Acties | BS1+ |
| Naar facturen-link | ❌ | ✅ | BS1+ |
| Console errors | 0 | 0 | ✅ |

## Geen bugs

Module 21 had **geen bugs** te fixen. BS1 is **superset van BS2**.

## Conclusie

Module 21 is **100% functionele pariteit** met BS2, met legitiem BS1 extras:
- 2-step wizard (vs BS2 1-step)
- Preview-controls (Vergroten/Ander bestand)
- Import history (BS2 heeft die niet)
- Naar facturen-link

Geen wijzigingen nodig — module is direct DONE.
