# Item 31 — Preconnect optimization + start van item 27 cleanup

**Datum**: 2026-05-12
**Status**: ✅ Voltooid (deels — item 27 nog 6 plekken open)
**Gerelateerd**: Item 30 aanbeveling (preconnect), item 27 (legacy confirm/prompt cleanup)

## Wijzigingen

### Preconnect optimization (item 30 aanbeveling)

`scripts/add-preconnect.mjs` voegt aan alle 53 HTML files toe:

```html
<link rel="preconnect" href="https://boscwvojcggkbdxhlfys.supabase.co">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
```

**Verwachte winst**: 50-100ms per cold page-load (DNS + TLS handshake parallel met HTML parse i.p.v. seriëel na CDN-script tag).

**Idempotent**: script skipt files die al een preconnect-link hebben.

**1 file overgeslagen**: `footer-pagination-snippet.html` (partial zonder `<head>`).

### Item 27 cleanup — 2 van 8 plekken voltooid

Vervangen van `window.confirm("Definitief verwijderen?")` door `await window.showSliderConfirmModal({...})` conform werkpatronen sectie 4 + 3:

1. **`instellingen.js:302`** — notification-type purge → slider-modal met `okLabel: "Verwijderen"`
2. **`verlof.js:319`** — verlof-aanvraag purge → slider-modal met preview van medewerker-naam

**Beide flows nu**:
- Showen de canonieke slider-modal (zelfde stijl als andere delete flows)
- Geven succes-feedback via `showActionFeedback("deleted", "...")`
- Geen rauwe browser-popup meer

**Nog te doen** (6 plekken in 5 files, item 27):
- `medewerker.js:2189` — `prompt("Afbeelding URL:")` voor profielfoto URL
- `nieuws.js:742, 1004` — `window.prompt("URL van de link:", ...)` (×2) voor link-insertie in rich-text editor
- `planning.js:2696` — `window.prompt("Geef een naam voor deze voorinstelling")` voor preset naming
- `salarishuis.js:908` — `window.prompt("Naam van de schaal", sc.title)` voor schaal-rename

Deze 6 zijn allemaal `prompt(...)` voor text-input — vereist een nieuwe `showInputModal` helper in `save-feedback.js` (huidige helpers ondersteunen alleen ja/nee bevestiging). Effort: ~30 min helper + 30 min vervangen + UI-test.

## Test plan

- [ ] Vercel preview deploy slaagt
- [ ] CI workflow groen
- [ ] Visueel: open instellingen.html → notificatie-types → verwijder een record → slider-modal verschijnt (i.p.v. browser-confirm)
- [ ] Visueel: open verlof.html → archiveer een aanvraag → "Definitief verwijderen" → slider-modal
- [ ] Network tab: preconnect-headers zijn aanwezig in HTML response

## Volgende stap

Item 32 of later: `showInputModal` helper toevoegen + resterende 6 `prompt()` plekken vervangen → item 27 volledig sluiten → CI workflow check uitbreiden met `prompt`/`confirm`/`alert`-detection.
