# Item 50 — Sprint 8: Taken filters/statussen (BS2 parity)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S8 in `../v2-master-plan.md`
**BS2 ref**: `/tasks/list`

## Wat is gedaan

### Gap-analyse BS2 ↔ BS1

BS2 Taken toolbar heeft 9 filters/controls; BS1 had er 5. Deze PR voegt de 4 missende toe + 1 ontbrekende kolom.

| Filter / Control | BS2 | BS1 vóór S8 | BS1 ná S8 |
|---|---|---|---|
| Search | ✅ | ✅ | ✅ |
| Mijn/Alle taken tabs | ✅ | ✅ | ✅ |
| Gearchiveerd toggle | ✅ | ✅ | ✅ |
| Voltooide verbergen | ✅ | ✅ | ✅ |
| Status dropdown | ✅ | ✅ | ✅ |
| Prioriteit dropdown | ✅ | ✅ | ✅ |
| **Teamlid filter** | ✅ | ❌ | ✅ |
| **Deadline date filter** | ✅ | ❌ | ✅ |
| **Aanmaakdatum date filter** | ✅ | ❌ | ✅ |
| **Reset-knop** | ✅ | ❌ | ✅ |
| Kolom: Aangemaakt door | ✅ | ❌ | ✅ |

NIET-meegenomen voor v2 (out of 3u scope):
- Deadline-bucket grouping (Vandaag/Te laat/Deze week/Later/Geen deadline) — grote UX-shift, planning v3
- Sorteren-op dropdown — BS1 heeft al column-header click-sort, voldoende

### Implementatie

**State**:
- `filterTeamlid` (medewerker_id van toegewezenAanId)
- `filterDeadline` (YYYY-MM-DD exact match)
- `filterAanmaakdatum` (YYYY-MM-DD exact match op datum-deel)

**getVisible()**:
- Filtering uitgebreid met de 3 nieuwe filters
- Search hay verbeterd met `medewerkerLabel(aangemaaktDoorId)` voor crash-protectie + zoekbaarheid

**renderRow()**:
- Nieuwe `<td data-col="aangemaakt_door">` cell met `medewerkerLabel(t.aangemaaktDoorId)` — "—" als id ontbreekt

**populateTeamlidFilter(sel)**:
- Vult dropdown met alle niet-gearchiveerde medewerkers, alfabetisch gesorteerd
- Refresh-listener op `besa:medewerkers-updated` event

**resetAllFilters()**:
- Mirror BS2 "Reset" knop
- Wist search + 3 nieuwe filters + status + prioriteit + showArchived (false) + hideDone (true)
- Toast feedback "Filters gewist"

### Files

- `taken.html` — toolbar uitgebreid (3 filters + Reset btn) + nieuwe `<th>` voor Aangemaakt door
- `taken.js` — state, getVisible, renderRow, init-bindings, helper-functies
- `styles.css` — `.taken-date-filter`, `.taken-reset-btn`

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅)
- [ ] Vercel deploy slaagt
- [ ] Toolbar toont 9 filters/controls (was 5)
- [ ] Teamlid dropdown vult zich met medewerkers
- [ ] Filter Teamlid="X" → alleen taken van X
- [ ] Filter Deadline=2026-05-15 → alleen taken met deadline op die datum
- [ ] Filter Aanmaakdatum idem
- [ ] Reset-knop → alle filters terug naar default + toast
- [ ] "Aangemaakt door" kolom toont creator naam ("—" voor legacy taken zonder aangemaaktDoorId)

## Acceptance (master-plan S8)

- ✅ BS2 deep walk uitgevoerd op `/tasks/list`
- ✅ Filters parity (alle 4 gaps gedicht)
- ✅ Statussen kolom-pill onveranderd (was al BS2-parity)

## Status update bij merge

Bij merge: master-plan S8 → ✅ DONE + PR-nummer. Direct start Sprint 9 (BS2 deep walk Beleid + document-import, 3u).
