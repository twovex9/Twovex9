# Module 25 — Facturen alle (monthly) — STRUCTURE

**BS2 URL**: `/invoices-module/monthly-invoices?status=submitted&status=approved&period=current`
**BS1 URL**: `https://besa-suite.vercel.app/facturen.html`
**Scrape datum**: 2026-05-14

## BS2 page
- h1: **Alle facturen**
- Sidebar 2 items: Te beoordelen / Alle facturen (active)
- Default filter: status=submitted+approved, period=huidige maand
- 27 records in default-view

## BS2 toolbar
- Kolommen-knop
- Periode chip (showing range)
- Reset-knop

## BS2 tabel (7 kolommen)
- (select) / Maand / Medewerker / Factuurnummer / Status / Aanmaakdatum / Bedrag

## BS1 mirror (na Bug #57)

- h1 **"Alle facturen"** ✅ (na Bug #57 fix, was "Facturen")
- 10 kolommen (BS1 superset, 3 extra: Beschikking / Cliëntnummer / Betaald)
- 990 records totaal in DB
- 4 modals: fact-export / fact-add / fact-arch / fact-purge

## BS1 toolbar (superset)
- Search input
- Verloopt binnen 60d toggle
- Gearchiveerd toggle
- 4 filter dropdowns: Status / Declaratie methode / Periode / Betaald
- Reset-knop
- Kolommen / Exporteren / + Factuur aanmaken (primary)

## Schema

- Supabase tabel: `public.facturen` (PK text)
- Velden abbreviated: fn / besch / client / nr / clientId / per / beta / st / bedr / bedragNum / archived / aanmaakdatum / laatstGewijzigd / _data

## Bugs gefixt

- **#57** (UI): h1 "Facturen" → "Alle facturen" (matches BS2 + sidebar label)
- **#58** (UI): fact-add-modal + fact-export-modal Escape close-way toegevoegd in facturen.js
