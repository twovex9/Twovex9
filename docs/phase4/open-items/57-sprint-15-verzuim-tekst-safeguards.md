# Item 57 — Sprint 15: Vrije tekst safeguards verzuim (AVG Art. 9)

**Datum**: 2026-05-13
**Status**: 🟡 In review (PR open)
**Master-plan**: S15 in `../v2-master-plan.md`
**Gerelateerd**: item 40 (GDPR Art. 9 verzuim), S2 (RLS verzuim hardening), S14 (DSR)

## Wat is gedaan

Verzuim `beschrijving` veld is een vrije tekstveld waar HR makkelijk per ongeluk **medische data** kan invoeren (diagnose, medicatie, etc.). Onder AVG Art. 9 is verwerking van gezondheidsgegevens verboden zonder strikte grondslag.

V1 had geen UI-safeguards. S15 voegt **3 lagen** toe (ascending strictness):

### 1. **Permanente waarschuwing** in modal-header

Gele banner boven het beschrijving-veld:

> ⚠️ Geen medische informatie noteren. AVG Art. 9 verbiedt verwerking van gezondheidsgegevens buiten strikt noodzakelijke context. Beschrijf alleen administratieve feiten (datum, status, contactmoment).

### 2. **Character limit + counter**

- `maxlength="500"` op textarea
- Live counter `0 / 500` naast label
- > 400 chars → rood/bold ("near limit")

### 3. **Medische trefwoord-detectie** (live)

Bij elke `input` event wordt tekst gescand op ~30 medische trefwoorden:
- `diagnose`, `medicatie`, `medicijn`, `antidepres`, `depress`, `burnout`,
- `kanker`, `tumor`, `covid`, `griep`, `zwanger`, `operatie`, `ziekenhuis`,
- `psychiat`, `trauma`, `therapie`, `diabetes`, `epileps`, `huisarts`, etc.

Bij detectie verschijnt een rode hint onder de textarea:
> ⚠️ **Mogelijk medische term gedetecteerd:** `diagnose`, `medicatie`. Overweeg administratief-neutrale formulering.

**Niet hard-block** — soms is een term administratief gerechtvaardigd (bv. "verwijzing naar huisarts" is procedureel, niet medisch). Beslissing aan HR.

### Placeholder

```
Bijv: ziekgemeld op 13 mei, gesprek 18 mei gepland. GEEN diagnose/medicatie.
```

Stuurt user direct in goede richting.

### Files

- `verzuim.html` — `.vz-gdpr-warning` banner + `maxlength="500"` + `data-gdpr-safeguarded="true"` attribute + counter span + placeholder
- `verzuim.js` — `GDPR_MEDISCH_KEYWORDS` array + `findMedischTokens()` + `updateBeschrijvingCounter()` + input/focus event listeners
- `styles.css` — `.vz-gdpr-warning`, `.vz-field-hint`, `.vz-field-hint--near-limit`, `.vz-medisch-warning` (~50 regels)

## Test plan

- [ ] CI groen (JS syntax `node -c` ✅)
- [ ] Vercel deploy slaagt
- [ ] `/verzuim.html` → bewerk record → modal toont gele AVG-waarschuwing
- [ ] Counter telt mee bij typen (0 / 500)
- [ ] Counter wordt rood/bold > 400 chars
- [ ] Bij intypen "diagnose" → rode keyword-warning verschijnt
- [ ] Bij intypen "ziekgemeld" → géén warning
- [ ] maxlength=500 wordt gehandhaafd door browser

## Acceptance (master-plan S15)

- ✅ Permanente AVG-waarschuwing zichtbaar
- ✅ Character limit op textarea (500)
- ✅ Live medische trefwoord-detectie
- ✅ Niet hard-block — HR-beslissing
- ✅ Placeholder die goed voorbeeld toont

## Status update bij merge

Bij merge: master-plan S15 → ✅ DONE + PR-nummer. Direct start Sprint 16 (BS2 deep walk per resterende module, 4-8u).
