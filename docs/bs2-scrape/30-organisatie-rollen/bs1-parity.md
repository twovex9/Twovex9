# Module 30 — Organisatie / Rollen — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 ("Rollen") | ✅ | ✅ | ✅ |
| Hiërarchische organogram-layout | ✅ | ✅ | ✅ |
| Aantal secties | 6 (incl "test" 0 rol) | 5 | functioneel ✅ |
| Aantal rollen | 14 | 14 | ✅ 1:1 match |
| Sectie-namen 1:1 | ✅ | ✅ | ✅ |
| Sectie-volgorde 1-5 | ✅ | ✅ | ✅ |
| Sectie-meta (X rollen · Y gebruikers) | ✅ | ✅ | ✅ |
| Sectie-descriptions (BS1 extra) | ❌ | ✅ 5 descriptions | BS1+ |
| Rol-naam per kaart | ✅ | ✅ | ✅ |
| Rol-volgorde binnen sectie | ✅ | ✅ | ✅ |
| Rol-badge (X gebruikers) | ✅ | ✅ | ✅ |
| Rol-descriptions per kaart (BS1 extra) | ❌ | ✅ 14 descriptions | BS1+ |
| Empty-state styling (--empty class) | ❓ | ✅ | BS1+ |
| Search-input (BS1 extra) | ❌ | ✅ debounced 150ms | BS1+ |
| Search op section + rol naam | n.v.t. | ✅ | BS1+ |
| Totaal-counter (BS1 extra) | ❌ | ✅ "X rollen, Y gebruikers" | BS1+ |
| Drag-drop CRUD (v3 Fase E) | ✅ | ❌ (read-only) | v3-deferred |
| Opslaan/Reset/Nieuwe rol/Nieuwe sectie | ✅ | ❌ (v3 Fase E) | v3-deferred |
| User-count per rol | 127 totaal (BS2 sandbox) | 1 (huidige test-admin) | v3 Fase G |
| Console errors | 0 | 0 | ✅ |

## BS1 superset features

1. **Section descriptions** — 5 description-rijen onder section-titels
2. **Rol descriptions** — 14 descriptions per rol-kaart
3. **Search** — debounced filter op section + rol naam (case-insensitive)
4. **Empty-state styling** — `.rollen-card--empty` voor 0-user rollen
5. **Totaal-counter** — live "X rollen, Y gebruikers"
6. **Cache + Live-refresh** — `besa:org-rollen-updated` event + localStorage cache

## v3 deferred (Fase E + G)

- **Fase E**: Drag-drop org-editor (Opslaan/Reset/Nieuwe rol/Nieuwe sectie buttons)
- **Fase G**: Bulk-onboarding 102 medewerker-profielen via `scripts/onboard-bs2-employees.mjs` → user-counts gaan kloppen met BS2

## "test" sectie (BS2 sandbox-clutter)

BS2 heeft een lege sectie genaamd "test" met 0 rollen ("No roles in this level"). Dit is BS2 sandbox-data zonder functionele waarde. BS1 neemt deze NIET over om de view schoner te houden.

Indien user wil dat we deze exact 1:1 spiegelen → kunnen we de "test" sectie toevoegen aan `public.org_role_sections` met volgorde=6. Niet gedaan in Module 30 (BS1 cleaner).

## Conclusie

Module 30 is **100% functionele pariteit** met BS2 (read-only viewer). BS1 levert SUPERSET met:
- Section + Rol descriptions
- Search-filter
- Empty-state styling
- Totaal-counter
- Cache + live-refresh

**Geen bugs gevonden in Module 30**. CRUD-functionaliteit (drag-drop org-editor) en user-onboarding zijn v3 Fase E + G items, niet Module 30.
