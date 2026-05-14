# Module 20 — Cliënten Uren budgetering — STRUCTURE

**BS2 URL**: `/clients/weekly-budget`
**BS1 URL**: `https://besa-suite.vercel.app/uren-budgettering.html` (filename behoudt double-t)
**Scrape datum**: 2026-05-14

## BS2 page
- title: `Cliënten | Embrace The Future`
- h1: **Uren budgetering** (single 't')
- Subtitle: "Configureer standaard uren en publiceer wekelijkse budgetten voor cliënten met een Ambulante of WLZ beschikking"

## Toolbar
- Cliënt-selector dropdown
- Jaar-selector (2026)
- Banner: "Selecteer een cliënt om verder te gaan" (geen client geselecteerd)

## Tabel (2 kolommen, 52 weken rijen)

| Kolom | Inhoud |
|---|---|
| Weken | Week 1 - (Dec 29, 2025 - Jan 4, 2026) ... Week 52 |
| Standaard uren | Editable uren per week (after client select) |

## BS1 mirror

- h1 = "Uren budgetering" ✅ (na Bug #50 fix)
- Title = "Uren budgetering — HR" ✅
- 52 weken rijen ✅
- 2 cols: Weken / Standaard uren ✅
- Cliënt-selector + Jaar-selector ✅
- Subtitle identiek aan BS2 ✅
- Extra BS1 features: Kolommen-knop + Bulk bewerken-knop (BS1 superset)

## Schema

- Supabase tabel: `public.uren_budget` (per client × jaar × week)
- Velden: id / clientId / jaar / week / standaardUren / aanmaakdatum / laatst_gewijzigd

## Bug gefixt

- **#50** (UI/spelling): "Uren bud**g**ettering" → "Uren bud**g**etering" (single 't')
  - 19 HTML files met sidebar-link aangepast
  - uren-budgettering.html: title + h1 aangepast
  - Filename `uren-budgettering.html` ongewijzigd (geen breaking change in interne references)

## Notitie

Filename behoudt double-t voor backward compatibility met JS references (uren-budgettering.js, uren-budget-data.js, top-nav-overflow.js etc.).
Display labels match nu BS2.
