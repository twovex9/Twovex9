# Item 29 — Cliënt-detail tabs verificatie compleet

**Datum**: 2026-05-12
**Status**: ✅ Voltooid
**Gerelateerd**: Item 1.1 uit `../06-professional-finish.md`, item 14 uit `../04-open-items.md`

Alle 9 tabs op `client-detail.html?id=<uuid>` getest via Chrome MCP. Bevestigt + verfijnt item 14.

## Test-cliënt

`f0ece081-a0c3-4bb7-ba51-5654d0c696c0` (Phabek Mityaniq, BS2-imported, fase "In zorg").

## Resultaten

| Tab | Status | textLen | Inhoud |
|---|---|---|---|
| Details | ✅ Functioneel | 2678 | NAW velden volledig |
| Beschikkingen | ✅ Functioneel | 6324 | Beschikkingen-lijst + filter "Verloopt binnen 60d" |
| **Betalingen** | ❌ Placeholder | 175 | "Hier kunnen straks betalingen of factuurstromen zichtbaar gemaakt worden. Import en koppeling volgen. Geen betalingsgegevens vastgelegd." |
| **Contacten** | ❌ Placeholder | 182 | "Contactpersonen, netwerk en verwijzers komen hier. Vul later aan of koppel met een agenda. Primair: — Overig: —" |
| Notities | ⚠️ Cross-ref | 137 | "Dossier-notities: gebruik de zijbalk of voeg straks vaste notitielijnen toe." — functioneel via side-panel, niet inline |
| Documenten | ✅ Functioneel | 3050 | Tabel met Naam/Type/Vervaldatum/Uploaddatum + kolomkiezer |
| **Rapportages** | ❌ Placeholder | 130 | "Lopende en afgeronde rapporten per cliënt worden hier gegroepeerd. Export/print volgt zodra aangesloten." |
| **Vragenlijsten** | ❌ Placeholder | 117 | "Ingevulde of openstaande vragenlijsten per cliënt. Koppeling met toets- of e-forms volgt." |
| Incidenten | ⚠️ Cross-link | 92 | "Bekijk alle incidenten van deze cliënt in het incidenten overzicht." — link i.p.v. inline data |

## Conclusie

Bevestigt item 14's claim van 4 placeholders. Plus 2 minor observaties:
- **Notities** is geen placeholder maar wel minimaal — functioneel via side-panel, niet via deze tab zelf. Acceptabel.
- **Incidenten** is een cross-link i.p.v. inline data. Acceptabel design choice (vermijdt duplicatie met `incidenten.html?cliënt=X` filter), maar zou inline-table kunnen krijgen voor consistentie.

**Item 1.1 uit 06-professional-finish gesloten** — alle 9 tabs nu inhoudelijk gedocumenteerd. Items 14 (4 placeholders implementeren) blijft open voor v2.
