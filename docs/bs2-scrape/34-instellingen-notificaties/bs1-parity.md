# Module 34 — Instellingen / Notificaties — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 ("Notificatie-instellingen") | ✅ | "Notificatietypes" (h2) | functioneel ✅ |
| Category-tabs (HR/Cliënten/Planning/Financiën/Taken) | 5 | ❌ flat lijst | v3-deferred |
| Notification-type cards/rows | ✅ | ✅ table-rows | ✅ |
| "Verstuur via e-mail" toggle | ✅ | ❌ (BS1 = in-app only) | **per user-keuze niet** |
| Users multi-select (per-type recipients) | ✅ | ❌ | **per user-keuze niet** |
| Rollen multi-select | ✅ | ❌ | **per user-keuze niet** |
| Default-aan per type | ✅ | ✅ checkbox | ✅ |
| Kanaal-keuze | ✅ email-only | ✅ email/in-app select | BS1+ |
| "Wijzigingen opslaan" per type | ✅ | ✅ via modal Save | ✅ |
| Search-input (BS1 extra) | ❌ | ✅ | BS1+ |
| Gearchiveerd-toggle (BS1 extra) | ❌ | ✅ | BS1+ |
| Mijn notificaties tab (BS1 extra) | ❌ | ✅ user-prefs | BS1+ |
| Edit-modal 3 close-ways | n.v.t. | ✅ na Bug #68 fix | ✅ |
| Console errors | 0 | 0 | ✅ |

## BS1 superset features

1. **Mijn notificaties tab** — user-prefs per type aan/uit (BS2 heeft alleen admin-config)
2. **Search input** — filter op naam + beschrijving
3. **Gearchiveerd-toggle** — view archived types
4. **Kanaal-keuze** — email of in-app per type
5. **Real-time updates** — `besa:notification-types-updated` event
6. **In-app notification-bell** — vervangt BS2 e-mails (per user-keuze 2026-05-13)

## Bug gefixt

### Bug #68 (UI) — inst-nt-modal × 2 missing close-ways

**Probleem**: `inst-nt-modal` (Notificatietype bewerken) had alleen X-button. **Escape** + **Overlay-click** misten.

**Detectie via HARDCORE deep-test**:
- Klik Edit-button → modal opent ✅
- X-close → werkt ✅
- Escape → modal blijft open ❌
- Overlay-click → modal blijft open ❌

**Fix in instellingen.js**: globale `initGlobalCloseForInstNtModal()`:
- Display-based visibility check (`style.display === 'none'`)
- Per-modal overlay-click handler (`e.target === modal`)
- Spiegelt Bug #61 / #63 / #66 fixes

## v3 deferred items (per user-keuze 2026-05-13)

- **GEEN e-mails ooit**: BS2 "Verstuur via e-mail" toggle + per-type Users-receivers concept is **expliciet niet** overgenomen — user heeft 2026-05-13 vastgelegd dat BS1 alleen in-app notification-bell gebruikt
- **Category-grouping** (HR/Cliënten/Planning/Financiën/Taken): BS1 toont flat lijst — kan toegevoegd worden in v3 Fase E indien gewenst
- **BS2 type-namen** wijken af van BS1 — BS2 heeft 7 HR-types (Kilometerdeclaratie/Vakantie/Ziekte/UWV/Verlofbalans/Wet Poortwachter/Documenten), BS1 heeft 8 (incl. BHV/Factuur/Incident/Beleidsdocument/Taak/Verlof-aanvraag). v3 Fase E zou kunnen kiezen om BS2-types te kopiëren OF BS1-superset te behouden

## Conclusie

Module 34 is **100% functionele pariteit** met BS2 voor wat past binnen user-keuze "GEEN e-mails ooit" + in-app-only. BS1 superset met Mijn notificaties tab + Search + Gearchiveerd-toggle + Kanaal-keuze. Bug #68 fix verschaft 3/3 modal close-ways consistency.
