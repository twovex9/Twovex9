# Item 59 — Sprint 17: Entiteiten (STRICT BS2 parity — geen optioneel)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S17 in `../v2-master-plan.md`
**Gerelateerd**: nieuwe absolute regel "alles uit BS2 → BS1, geen optioneel"

## Nieuwe absolute regel (user 2026-05-13)

> "Het is belangrijk dat alles gekopieerd is, alle informatie van BESA Suite 2. Heel gemakkelijk, dus niets optioneel. Als het op BESA Suite 2 staat, moet dit op onze BESA Suite ook. Altijd. Moet. Altijd."

S17 stond eerder als ⏸️ OPTIONEEL in master-plan. Per nieuwe regel: dit MOET geïmplementeerd.

## BS2 walk

**Locatie**: `/settings/entities` (Instellingen-sidebar tab naast Gebruikers + Notificaties)

**Inhoud**:
- Title "Entiteiten" + Kolommen-knop
- Search input
- Table 1 kolom "Naam"
- 7 records: `client`, `employee`, `disposition`, `invoice`, `quotation`, `Disposition`, `Phase`

## BS1 implementatie

BS2 spiegelen + value toevoegen (counts uit eigen DB):

### `instellingen.html`

Nieuwe 4e tab-chip "Entiteiten" naast Mijn profiel / Mijn notificaties / Notificatietypes.

Nieuw panel `#inst-panel-entiteiten` met:
- Title + Kolommen-knop (3 toggles)
- Search input
- Table: Naam / Beschrijving / Aantal records (3 kolommen vs BS2's 1)

### `instellingen.js`

- `ENTITEITEN_LIST` — 7 records identiek aan BS2 (client/employee/disposition/invoice/quotation/Disposition/Phase) + Nederlandse beschrijving + BS1-tabel mapping
- `ENTITEITEN_COLUMN_CONFIG` — 3 kolommen, Naam = skipToggle
- `read/writeEntColumnPrefs` (localStorage `inst_entiteiten_columns_v1`)
- `setEntColVisible` + `applyEntColumnVisibility`
- `buildEntColumnsPanel` + `wireEntColumnsPanel`
- `getEntCount(table)` — async Supabase count via `select('*', {count:'exact', head:true})`
- `renderEntiteiten()` — table render + async count-update voor BS1-tabellen
- `setTab` extended met "entiteiten" key
- Init: tab-listener + search-listener + columns panel build

### Counts (BS1-extra waarde)

BS2 toont alleen namen. BS1 toont ook **aantal records** per entiteit door Supabase HEAD-count:
- `client` → counts `clienten`
- `employee` → counts `medewerkers`
- `disposition` → counts `beschikkingen`
- `invoice` → counts `facturen`
- `quotation`, `Disposition`, `Phase` → geen BS1 mapping (BS2-specifiek), toont "—"

## Files

- `instellingen.html` — 4e tab-chip + nieuwe panel-sectie
- `instellingen.js` — `ENTITEITEN_LIST` + 8 helper-functies + tab/listener wire-up
- Reuse bestaande CSS: `.columns-dropdown`, `.column-toggle*`, `.col-hidden`, `.filter-chip`

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅)
- [ ] Vercel deploy slaagt
- [ ] `/instellingen.html` toont 4 tabs (was 3)
- [ ] Klik Entiteiten → table laadt met 7 records
- [ ] Counts updaten async (clienten ~93, medewerkers ~103, etc.)
- [ ] Search filtert naam + beschrijving
- [ ] Kolommen-toggle werkt voor Beschrijving + Aantal records

## Acceptance (master-plan S17 — nu STRICT)

- ✅ Module geïmplementeerd (BS2-page bestaat → BS1 moet ook)
- ✅ Zelfde 7 entity-namen als BS2
- ✅ BS1-style consistent (filter-chips, table-card, columns-dropdown)
- ✅ Extra waarde: counts uit eigen Supabase

## Status update bij merge

Bij merge: master-plan S17 → ✅ DONE + PR-nummer (van ⏸️ OPTIONEEL → ✅). Direct start Sprint 18 (Final live verification BS1↔BS2, 4u).
