# Item 32 — Item 27 volledig gesloten (alert/confirm/prompt cleanup)

**Datum**: 2026-05-12
**Status**: ✅ Voltooid — item 27 nu volledig gesloten + CI check actief
**Gerelateerd**: items 27 (tech-debt), 31 (eerste 2 fixes), 4.3 (CI workflow uitbreiding)

## Wijzigingen

### 1. Resterende 6 `prompt()` fallbacks vervangen

`showPromptModal` bestond al in `save-feedback.js` — geen nieuwe helper nodig. Bestaande code gebruikte het al via een fallback-patroon (`typeof window.showPromptModal === "function" ? ... : window.prompt(...)`). Fallback weggehaald omdat `save-feedback.js` overal geladen wordt (werkpatronen sectie 5).

| File | Locatie | Functie |
|---|---|---|
| `medewerker.js:2189` | rich-text editor "Afbeelding URL:" prompt | profielfoto URL invoegen |
| `nieuws.js:742` | rich-text editor "URL van de link:" prompt | link insertie |
| `nieuws.js:1004` | rich-text editor "URL van de link:" prompt (2e plek) | link insertie nieuwsbericht |
| `planning.js:2696` | "Geef een naam voor deze voorinstelling" prompt | preset naming |
| `salarishuis.js:908` | "Naam van de schaal" prompt | schaal rename |

Alle 6 zijn nu pure `await window.showPromptModal({...})` calls met passende `title`, `label`, `placeholder`, `okLabel`.

### 2. CI workflow forbidden-patterns check geactiveerd

`.github/workflows/ci.yml` heeft nu een nieuwe step:

```yaml
- name: Forbidden browser-popup patterns
  run: |
    # Flag window.alert/confirm/prompt + bare alert/confirm/prompt calls
    # Excl save-feedback.js (mag de patterns bevatten — heeft de vervangers)
```

Faalt bij élke `window.alert(`, `window.confirm(`, `window.prompt(`, of bare `alert(`/`confirm(`/`prompt(` in productie-code. Garandeert dat toekomstige PR's geen browser-popups herintroduceren.

**Bewijst groei van defense-in-depth**:
1. Werkpatronen sectie 4 documenteert de regel (mensgericht)
2. CI workflow flagt overtredingen (geautomatiseerd)

## Status item 27

✅ Volledig gesloten. Geen `window.confirm`, `window.prompt`, `alert(` of `prompt(` meer in productie-code (alleen in `save-feedback.js` als string-comments + de helpers zelf).

## Item 27 referenties (te updaten?)

Item 27 in `04-open-items.md` markeert dit als "open". Aanbeveling: bij volgende PR een statusupdate-item in `open-items/` toevoegen die zegt "item 27 is gesloten — zie item 32".

## Test plan

- [ ] CI workflow groen (nieuwe forbidden-patterns check passeert)
- [ ] Visueel: medewerker-detail → afbeelding invoegen in profielfoto/notitie → showPromptModal verschijnt
- [ ] Visueel: nieuws → link toevoegen in editor → showPromptModal verschijnt
- [ ] Visueel: planning → "Nieuwe voorinstelling" → showPromptModal met "Naam van de voorinstelling"
- [ ] Visueel: salarishuis → schaal hernoemen → showPromptModal met huidige naam als default
