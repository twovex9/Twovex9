# Module 12 — HR Verzuim — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/hr/all-sickness`
**BS1 URL**: `https://besa-suite.vercel.app/verzuim.html`
**Scrape datum**: 2026-05-14

## BS2 page top-level

- title: `Embrace The Future` (generic)
- h1 default: **Lange termijn afwezigheid**
- HR-sidebar positie: **top-level** (na Verlof-groep, vóór Nieuws)

## BS2 sidebar volgorde (HR)

```
1. Medewerkers
2. Competenties
3. Opleidingen
4. Locaties
5. Salarishuis
6. Bureau's
7. Salarisadministratie
8. Verlof (collapsible)
9. Verzuim       ← top-level, geen sub-items
10. Nieuws
```

## Tabs (chips)

- `Lange termijn` (default active)
- `Korte termijn`

## Toolbar

- `Kolommen` knop (kolom-zichtbaarheid toggle)
- (geen + Toevoegen knop op overzicht — CRUD gebeurt via medewerker-detail)
- (geen Gearchiveerd toggle)
- (geen export-knop op deze pagina)

## Tabel (7 kolommen)

| Kolom | Inhoud |
|---|---|
| Medewerker | Voornaam + achternaam + (optioneel) avatar |
| Eerste ziektedag | Datum (DD-MM-YYYY) |
| Verwachte terugkeerdatum | Datum of `-` |
| Werkelijke terugkeerdatum | Datum of `-` |
| Beschrijving | Tekst (truncated) |
| Status | Pill (Ziek / Hersteld / etc.) |
| Acties | Edit-icon + Delete-icon |

## CRUD

- **Toevoegen**: niet vanaf `/all-sickness` overzicht — wel vanaf medewerker-detail page (`/hr/employee/{id}` → Verzuim-tab)
- **Bewerken**: edit-icon in actie-kolom → modal "Registratie bewerken"
- **Verwijderen**: delete-icon in actie-kolom → modal "Verzuimregel verwijderen" met slider-confirm

## BS1 mirror (verzuim.html)

- title: `Verzuim — HR`
- h1: **Lange termijn afwezigheid** (matches BS2 ✅)
- tabs class: `.vz-tab` (id `vz-tab-lang` + `vz-tab-kort`)
- table id: `vz-table`, tbody id: `vz-tbody`
- search id: `vz-search`
- edit modal: `#vz-edit-modal` (uses `.emp-verzuim-modal-overlay` legacy)
- delete modal: `#vz-delete-modal` (uses `.modal-overlay` + slider-confirm)
- Active record count: 11 lange-termijn + 3 korte-termijn = **14 records**

## BS1 huidige sidebar-positie (VERSCHIL met BS2)

```
BS1 huidig:
  ...
  Salarisadministratie
  Verlof (collapsible)
  Compensatie (collapsible)
    ├ Saldi
    ├ Berekeningen
    ├ Feestdagen
    ├ Diensttypes
    └ Verzuim       ← genest onder Compensatie (BUG #33)
  Nieuws
```

**Bug #33**: Verzuim moet uit Compensatie-groep + als top-level item geplaatst worden conform BS2.
