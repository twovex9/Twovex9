# Module 19 — Cliënten Urendeclaraties — STRUCTURE

**BS2 URL**: `/clients/hour-declarations?year=YYYY&month=MM`
**BS1 URL**: `https://besa-suite.vercel.app/urendeclaraties.html`
**Scrape datum**: 2026-05-14

## BS2 page
- title: `Cliënten | Embrace The Future`
- h1: **Urendeclaraties**
- 4 records voor mei 2026

## Header stats
- "33u 50m — Uren te declareren"
- "€ 2.534,51 — Te declareren periode"

## Toolbar
- Kolommen-knop
- Maand vergrendelen (primary blue)
- Search (Zoeken...)
- Filter: Jaar / Maand / Zorgsoorten / Reset

## Tabel (9 kolommen)

| Kolom | Inhoud |
|---|---|
| (select) | Multi-select checkbox |
| Cliënt | Voor- + achternaam |
| Maand/Datum bereik | Maand-naam |
| Beschikking | Beschikking-text |
| Zorgsoort | Pill |
| Uurtarief | € XX,XX |
| Bedrag | € XX.XXX,XX |
| Gebudgetteerde uren | bv. 40u |
| Geregistreerde uren | bv. 0u, 14u 5m |

## BS1 mirror

- h1 = "Urendeclaraties" ✅
- 9 cols identiek aan BS2 ✅ (na Bug #49 fix)
- Toolbar: Search + Jaar/Maand/Zorgsoorten filters + Reset + Kolommen + Maand vergrendelen
- Stats: "Uren te declareren" + "Te declareren periode" ✅
- 7 records totaal (jaar 2024+2025+2026)

## Schema

- Supabase tabel: `public.urendeclaraties`
- PK: id
- Velden: id / client / beschikking / zorgsoort / jaar / maand / uurtarief / bedrag / gedebiteerdeUren / ingediendeUren

(N.B.: data-velden behouden hun naam intern; alleen de display-labels matchen nu BS2)

## Bug gefixt

- **#49** (UI): Kolom-headers `"Gedebiteerde uren"` → `"Gebudgetteerde uren"` en `"Ingediende uren"` → `"Geregistreerde uren"` om 1:1 te matchen met BS2 terminologie
