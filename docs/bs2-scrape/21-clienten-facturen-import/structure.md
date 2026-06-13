# Module 21 — Cliënten Facturen importeren — STRUCTURE

**BS2 URL**: `/clients/import-csv`
**BS1 URL**: `https://futureflow-app.vercel.app/facturen-importeren.html`
**Scrape datum**: 2026-05-14

## BS2 page
- title: `Cliënten | Embrace The Future`
- Geen h1 zichtbaar (kale upload-page)
- Single-step upload + Volgende-knop

## BS2 toolbar
- File upload area: "Klik om te uploaden of sleep en zet neer"
- Accept types: SVG, PNG, Excel, CSV, JPG, PDF, .docx (max 20MB)
- Volgende-knop (disabled tot bestand)

## BS1 mirror (superset)

- h1: **Facturen importeren** (BS1 extra heading)
- **2-step wizard**: 1 "Bestand kiezen" / 2 "Controleren"
- File upload area zelfde tekst als BS2
- File input accepts: `.svg,.png,.xlsx,.xls,.csv,.jpg,.jpeg,.pdf,.docx,.doc`
- Step 1 buttons: Volgende (`#fi-next-1`) / Vergroten / Ander bestand / Clear-X
- Step 2 buttons: Vorige (`#fi-back-2`) / Importeren (`#fi-next-2`) / Vergroten
- **Import history-tabel** (BS1 extra): Bestandsnaam / Type / Grootte / Geïmporteerd op / Acties
- Naar facturen-link (BS1 extra)

## Schema

- Geen Supabase-tabel directly — uploaden gaat naar Storage (`facturen` bucket)
- Imported files tracked in localStorage / events

## Geen bugs

BS1 is functioneel pariteit (alles wat BS2 doet) + extras (2-step wizard, history-tabel, Naar facturen-link).
Module 21 had **geen bugs** te fixen.
