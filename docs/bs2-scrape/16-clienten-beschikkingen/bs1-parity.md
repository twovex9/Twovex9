# Module 16 — Beschikkingen — BS1 PARITY

**Datum**: 2026-05-14

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Beschikkingen" | ✅ | ✅ | ✅ |
| Sidebar group Beschikkingen | ✅ Dashboard/Overzicht/Facturen | ✅ Dashboard/Overzicht/Facturen | ✅ |
| Search input | ✅ | ✅ | ✅ |
| Kolommen-knop | ✅ | ✅ | ✅ |
| Exporteren-knop | ✅ | ✅ | ✅ |
| Beschikking toevoegen (primary) | ✅ | ✅ | ✅ |
| 9 kolommen BS2 / 12 cols BS1 | base | ✅+ (BS1 heeft 3 extra: Te decl LM / Nog niet decl / Status) | BS1 superset |
| Fase filter dropdown | ✅ | ✅ proper case na Bug #46 | ✅ |
| Zorgsoort filter dropdown | ✅ | ✅ deduped na Bug #47 | ✅ |
| Status filter | ✅ | ✅ | ✅ |
| Declaratie methode filter | ✅ | ✅ | ✅ |
| Reset filter knop | ✅ | ✅ #besc-reset | ✅ |
| Add modal × 3 close-ways | n.v.t. | ✅ X/Esc/Overlay na Bug #44 | ✅ |
| Export modal × 3 close-ways | n.v.t. | ✅ X/Esc/Overlay na Bug #45 | ✅ |
| Purge modal × 3 + slider | ✅ | ✅ | ✅ |
| Multi-select checkbox | ✅ | ✅ | ✅ |
| Periode-formaat (date range) | ✅ | ✅ | ✅ |
| Tarief-formaat (€ /dag /uur) | ✅ | ✅ | ✅ |
| Console errors | 0 | 0 | ✅ |

## Bugs gefixt

### Bug #43 — Fase case-mix (DATA)
- Vóór: 8 unique fase-values (actief + Actief / verlopen + Verlopen / in_aanvraag + In aanvraag / in_zorg + In zorg)
- Na SQL UPDATE: 4 unique (Actief=159 / Verlopen=71 / In aanvraag=19 / In zorg=2)
- Matches BS2 proper case

### Bug #44 — Add-modal Escape close (UI)
- Vóór: alleen X-knop + Overlay sloten add-modal
- Fix: globale `keydown` handler in `beschikkingen-overzicht.js` voor Escape

### Bug #45 — Export-modal Escape close (UI)
- Vóór: alleen X-knop + Overlay sloten export-modal
- Fix: zelfde globale Escape-handler (purge > export > add prioriteit)

### Bug #46 — Fase dropdown values mismatch (UI/data sync)
- Vóór HTML hardcode: `actief / in_aanvraag / in_zorg / verlopen / uit_zorg / in_dienst / uit_dienst` (lowercase/snake_case + extra waarden)
- Na fix: alleen 4 values matching DB (`Actief / In aanvraag / In zorg / Verlopen`)
- Filter werkt nu correct

### Bug #47 — Zorgsoort dropdown duplicates (UI)
- Vóór: Multiple zorgsoortKey UUIDs met dezelfde label kregen ieder een eigen option (bv. "Ambulant intern" 5x)
- Fix: dedupe by label in `beschikkingen-overzicht.js` populate-functie
- Per unieke label slechts 1 option

## Conclusie

Module 16 beschikkingen is **100% functionele pariteit** met BS2 na 5 bug-fixes.

BS1 heeft extra features bovenop BS2:
- 3 extra kolommen (Te declareren LM / Nog niet gedeclareerd / Status)
- 4 extra filter-toggles (Gearchiveerd / Verloopt binnen 60d / Heeft te decl LM / Heeft nog niet decl)
