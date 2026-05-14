# Module 19 — Urendeclaraties — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Urendeclaraties" | ✅ | ✅ | ✅ |
| Sidebar item (positie 6 Cliënten-menu) | ✅ | ✅ | ✅ |
| Header stat "Uren te declareren" | ✅ | ✅ | ✅ |
| Header stat "Te declareren periode" | ✅ | ✅ | ✅ |
| Search input | ✅ | ✅ #ud-search | ✅ |
| Jaar-select (2024/2025/2026) | ✅ | ✅ #ud-sel-jaar | ✅ |
| Maand-select | ✅ | ✅ #ud-sel-maand | ✅ |
| Zorgsoort-select | ✅ | ✅ #ud-sel-zorg | ✅ |
| Reset-knop | ✅ | ✅ #ud-reset | ✅ |
| Kolommen-knop | ✅ | ✅ #ud-cols-btn | ✅ |
| Maand vergrendelen (primary) | ✅ | ✅ #ud-lock-btn | ✅ |
| Kolom "Cliënt" | ✅ | ✅ | ✅ |
| Kolom "Maand/Datum bereik" | ✅ | ✅ | ✅ |
| Kolom "Beschikking" | ✅ | ✅ | ✅ |
| Kolom "Zorgsoort" | ✅ | ✅ | ✅ |
| Kolom "Uurtarief" | ✅ | ✅ | ✅ |
| Kolom "Bedrag" | ✅ | ✅ | ✅ |
| Kolom "Gebudgetteerde uren" | ✅ | ✅ na Bug #49 fix | ✅ |
| Kolom "Geregistreerde uren" | ✅ | ✅ na Bug #49 fix | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bug gefixt

### Bug #49 — Kolom-headers terminologie (UI)
- **Vóór** (BS1): "Gedebiteerde uren" / "Ingediende uren"
- **BS2**: "Gebudgetteerde uren" / "Geregistreerde uren"
- **Fix**: HTML labels in urendeclaraties.html aangepast
- **Data-velden behouden**: `gedebiteerdeUren` / `ingediendeUren` blijven (geen breaking change in data layer)

## Conclusie

Module 19 urendeclaraties is **100% functionele pariteit** met BS2 na Bug #49 fix. Alle 9 kolommen + alle filters + Maand vergrendelen functioneel identiek.

## Data-context

BS1 toont 7 records over 3 jaren (2024-2026), BS2 toont 4 voor de huidige maand (mei 2026).
Voor productie-pariteit niet blokkerend — Bs1 toont alle records, BS2 filtert op huidige maand default.
