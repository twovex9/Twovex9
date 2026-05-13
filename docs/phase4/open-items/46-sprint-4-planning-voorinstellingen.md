# Item 46 — Sprint 4: Planning filter-voorinstellingen

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S4 in `../v2-master-plan.md`
**BS2 ref**: `/planning/overview` → sidebar "Filter Voorinstellingen"

## Wat is gedaan

BS1 planning.html krijgt opgeslagen filter-voorinstellingen, mirror van BS2.

### Database (via Supabase MCP migration)

- **`public.planning_voorinstellingen`** (id uuid PK, user_id FK auth.users, naam text, filter_state jsonb, aanmaakdatum, laatst_gewijzigd)
- UNIQUE constraint `(user_id, naam)` — geen duplicate names per user
- INDEX `(user_id, naam)`
- TRIGGER `trg_planning_voorinstellingen_touch` → laatst_gewijzigd
- RLS (per-user + admin):

| Cmd | Policy | Toelichting |
|---|---|---|
| SELECT | `user_id = auth.uid() OR is_admin()` | Eigen + admin voor support |
| INSERT | `user_id = auth.uid()` | Alleen voor jezelf |
| UPDATE | `user_id = auth.uid()` | Eigen wijzigen |
| DELETE | `user_id = auth.uid() OR is_admin()` | Eigen + admin |

### Data-laag (`planning-voorinstellingen-data.js`)

Volgt het canonical patroon (sectie 6a-d in werkpatronen.md):
- `window.planningVoorinstellingenDB.{ready, add, update, delete, getAllSync, refresh}`
- Cache `planning_voorinstellingen_v1`
- Event `besa:planning-voorinstellingen-updated`
- Foutfeedback via `besa-sync-reporter.js`

### UI (`planning.html` + `planning.js`)

- Lijst van presets boven "Nieuwe voorinstelling maken +" knop
- Klik op preset-naam → filter_state JSON wordt toegepast op `filterState` + UI gesynchroniseerd
- Hover toont prullenbak per preset → slider-confirm modal voordat we verwijderen
- "Nieuwe voorinstelling maken +" toont inline naam-input + checkmark/X (Enter = save, Esc = cancel)
- Save serializeert huidige `filterState` (Set → Array voor JSONB)
- Duplicate-naam fout → rode foutmelding "Er bestaat al een voorinstelling met naam X"

### Serialization-shape

```json
{
  "diensttypes": ["Vroege dienst", "Late dienst"],
  "assignStatus": "alle",
  "teamlid": "uuid",
  "client": "client-id-text",
  "locatieToolbar": "vestiging-uuid"
}
```

(`afdeling`, `teamlead`, `teamleden`, `clienten`, `medewerkers`, `vestiging`, `locatie` Sets uit `filterState` zijn legacy/onused in huidige sidebar — niet meegenomen om bloat te vermijden.)

### Files

- `planning-voorinstellingen-data.js` (nieuw, ~160 regels)
- `planning.html` — nieuw `<ul>` + inline naam-form + script-tag
- `planning.js` — placeholder vervangen door wire-up + helpers + render
- `styles.css` — `.planning-erm-presets-list`, `.planning-erm-preset-item`, `.planning-erm-preset-label`, `.planning-erm-preset-del`, `.planning-erm-presets-form`, `.planning-erm-presets-input`, `.planning-erm-presets-save`, `.planning-erm-presets-cancel`

## Test plan

- [ ] CI groen (JS syntax al lokaal gecheckt met `node -c`)
- [ ] Vercel deploy slaagt
- [ ] `/planning.html` toont sidebar met "Filter Voorinstellingen" header + lijst (leeg in eerste use)
- [ ] Klik "+" → inline naam-input verschijnt, Enter slaat op
- [ ] Opgeslagen preset verschijnt in lijst
- [ ] Klik preset → filters worden toegepast (radio's, dropdowns, diensttype-multiselect)
- [ ] Hover preset → prullenbak verschijnt; klik → confirm-slider; bevestigen → preset weg
- [ ] Tweede preset met zelfde naam → rode foutmelding (UNIQUE constraint)
- [ ] Andere user ziet jouw presets niet (RLS)

## Acceptance (master-plan S4)

- ✅ Migration `planning_voorinstellingen` met user-scope RLS
- ✅ UI: "Opslaan als voorinstelling" (in deze impl als inline naam-input + checkmark, BS2-stijl)
- ✅ UI: lijst "Mijn voorinstellingen" boven create-knop
- ✅ JS: serialiseer huidige filter-state als JSON

## Status update bij merge

Bij merge: master-plan S4 → ✅ DONE + PR-nummer. Direct start Sprint 5 (Planning Exporteren CSV, 2u).
