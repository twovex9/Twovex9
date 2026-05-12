# Phase 2 — Block 2: Beleidsdocumenten (nieuwe module — gap-fill)

**Datum**: 2026-05-12
**Status**: ✅ Compleet
**Commits**: migration + 15 inserts via Supabase MCP; code via `655cc1c` op `main`

## Doel

Echte porting-werk: nieuwe module bouwen voor de Beleidsdocumenten-functie uit BS2 `/documents`. BS1 had geen tabel, geen page, geen data-laag. Eerst echte gap-fill in dit project.

## Werk uitgevoerd

### B2.1+2 — Schema migration via `mcp__supabase__apply_migration`
Migration `create_beleidsdocumenten`:
- `public.beleidsdocumenten` tabel (text PK, volgnummer int, naam, type, uploaddatum, laatst_gewijzigd, archived, file_name/mime/size, storage_path)
- 2 indexes (volgnummer + archived)
- 4 RLS policies (`auth kan beleidsdocumenten [lezen|toevoegen|bewerken|verwijderen]`) — `to authenticated using (true)` conform werkpatronen 6d-ter
- Storage bucket `beleidsdocumenten` (public)
- 4 storage.objects RLS policies voor de bucket
- Auto-update trigger `set_beleidsdocumenten_updated()` op `laatst_gewijzigd`

### B2.3 — Data-laag (`beleidsdocumenten-data.js`, 270 regels)
- Patroon van `medewerker-documenten-data.js` (Storage + metadata split)
- `window.beleidsdocumentenDB` API: `ready`, `refresh`, `getAllSync`, `getByIdSync`, `add`, `update`, `archive`, `restore`, `delete`
- Storage upload via `uploadToStorage()`, dataURL→Blob conversie, public URLs in cache
- Cache in `localStorage["beleidsdocumenten_v1"]`, gesorteerd op volgnummer
- Event `besa:beleidsdocumenten-updated` voor live re-renders
- Bootstrap met fail-feedback via `besaReportSyncFailure` indien Supabase faalt

### B2.4 — Admin page (`beleid.html`, 200 regels)
- Standaard BS1 topbar (kopie van bestaande pattern)
- Content-header met titel + "+ Beleidsdocument toevoegen" btn
- Toolbar met search + Gearchiveerd toggle (`.switch--yellow`)
- Tabel-card met kolommen: Nr. / Naam / Type / Uploaddatum / Laatst gewijzigd / Bestand / Acties
- Footer met pagination (Rijen per pagina + first/prev/next/last)
- 3 modals: Add/Edit (form), Archive (slider-confirm), Purge (slider-confirm)
- File-input voor PDF/Word upload in add-modal
- Script load-volgorde conform werkpatronen 6d: Supabase CDN → client → sync-reporter → auth-guard → profiles → data → page-script

### B2.5 — Page-script (`beleid.js`, 280 regels)
- State: search, showArchived, page, rowsPerPage, editingId, archivingId, purgingId
- `getVisible()` filtert op archived + search-string
- `renderRow()` produceert HTML met Naam-knop (open edit), Bestand-link, Acties (trash → archive of restore+purge)
- `render()` met pagination
- `submitAddForm()` async: leest file als data-URL → `add()` of `update()` op data-laag
- Archive & Purge slider-modals met 100%-confirm pattern conform werkpatronen 3a
- Event-delegation op tbody voor edit/archive/restore/purge
- `besa:beleidsdocumenten-updated` listener voor live updates

### B2.6 — Data port: 15 BS2-protocollen ingevoegd via `execute_sql`
| ID | Naam | Type |
|---|---|---|
| bd_09 | 09. Uitgifte en Gebruik Bankpas | protocol |
| bd_10 | 10. Beleidsprotocol Middelengebruik | protocol |
| bd_11 | 11. Stagebegeleider beleidsdocument | beleid |
| bd_12 | 12. Gefaseerde Time-Out | protocol |
| bd_13 | 13. Beleid Veilig mailen | beleid |
| bd_14 | 14. Dossieranalyse | beleid |
| bd_15 | 15. Ziekteverzuimbeleid ZZP | beleid |
| bd_16 | 16. Aanvulling detacheringsbureaus bij uitval | protocol |
| bd_17 | 17. Richtlijnen stage (stagiair & stagebegeleider) | richtlijn |
| bd_18 | 18. HR & facturatie protocol | protocol |
| bd_19 | 19. Onboarding- en begeleidingsstructuur | beleid |
| bd_20 | 20. Dienstoverdracht protocol | protocol |
| bd_21 | 21. Dienstuitval & Escalatieladder protocol | protocol |
| bd_22 | 22. Stageprotocol jeugdzorg | protocol |
| bd_23 | 23. Vier weken Onboardingsplan ondersteunende afdelingen | protocol |

Alleen metadata — PDF/Word-bestanden zelf moeten nog door user geüpload worden via de nieuwe admin-page. Volgnummers 01-08 en 24-25 ontbreken (niet zichtbaar in BS2 page 1; pagina 2 niet gecaptured).

### B2.7 — Nav-link integration (deferred)
De top-nav verwijst nog naar `werkruimte.html#beleid` op alle 30+ HTML files. Update naar `beleid.html` zou een mass-edit door alle pages vereisen. **Toegang voor nu via direct URL**: `https://besa-suite.vercel.app/beleid.html`.

Aparte mini-taak voor later: regex-replace `href="werkruimte.html#beleid"` → `href="beleid.html"` in alle BS1 HTML files.

### B2.8 — Verify
- Vercel build `655cc1c`: status Ready (Just now by ETheFuture)
- Live URL: `https://besa-suite.vercel.app/beleid.html` → toont alle 15 protocollen
- Console clean (alleen onschadelijke Chrome-extensie warning)
- Network: GET supabase REST `/beleidsdocumenten?select=*&order=volgnummer.asc` → 200

## Wat ontbreekt nog (toekomstige iteraties)

- Top-nav update in alle 30+ HTML files (`werkruimte.html#beleid` → `beleid.html`)
- 10 ontbrekende protocollen (01-08, 24-25) — bezoek BS2 `/documents?page=2` om titels te krijgen
- Echte PDF/Word bestanden uploaden via de UI (gebruiker)
- Kolomkiezer (Kolommen-knop) en sort-menu per kolom — werd geskipt voor v1
- Excel/CSV export (matchend met andere admin-pages)
- Detail-page per beleidsdocument (huidig: edit-modal volstaat)

## Lessons learned

- **medewerker-documenten-data.js is een goede template** voor Storage-backed data-lagen — copy structure + adapt scope
- **Race condition** tussen `render()` op lege cache en bootstrap fetchAll: opgelost door `.ready.then(render)` na initial render
- **De CLAUDE.md script-volgorde-regel** voorkomt silent failures: vergeet niet `besa-sync-reporter.js` + `auth-guard.js` + `profiles-data.js` vóór de data-laag
- **Public bucket** is OK voor beleidsdocumenten (toegankelijk via auth-guarded pages alleen)
