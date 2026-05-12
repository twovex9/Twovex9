# Item 38 — BS2 sync eerste poging: bevindingen + nieuwe aanpak voor v2

**Datum**: 2026-05-12
**Status**: ⏳ **Defer naar v2** — Bearer-only fetch werkt niet, vereist andere aanpak
**Gerelateerd**: items 1, 36 (initial sync plan), 12 (Bearer-token workflow)

## Wat we probeerden (2026-05-12)

1. User extraheerde Bearer-token uit BS2 browser sessie (987 chars JWT)
2. User extraheerde Supabase service_role key
3. Beide ge`$env:` in PowerShell
4. `node scripts/bs2-fetch.mjs` — fetcht alle 28 BS2 endpoints met Bearer

## Resultaat

**0 van 28 endpoints succes.** Alle endpoints returneerden HTML in plaats van JSON:

```
ERROR: JSON parse: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Dit betekent: BS2 backend stuurt de SPA-fallback HTML-page i.p.v. JSON. Bearer-token alleen is niet voldoende voor auth.

## Root cause

BS2 is een **Laravel SPA** (`etf.acceptance.besasuite.nl`). Laravel auth-flow voor API's heeft typisch:

1. **Sanctum/Passport flow** — werkt met alleen Bearer-token, MAAR de routes moeten in `routes/api.php` zitten met middleware `auth:sanctum` of `auth:api`
2. **Web session flow** — routes in `routes/web.php` met middleware `auth:web`, vereist session cookies + CSRF-token

BS2's `/api/*` endpoints lijken in pad-2 te zitten (web session). Bearer-token van het frontend is bedoeld voor browser-context dat ook cookies meestuurt. Een directe Node fetch heeft die cookies niet → unauthorized → HTML fallback.

## Tweede probleem: BS2-UUID niet bewaard in Phase 3

`scripts/bs2-fix-client-id.mjs` zag 90 van 92 cliënten "geen BS2 id" — omdat de Phase 3 import de originele BS2-UUID niet expliciet in `clienten.data.bs2_id` of soortgelijk opsloeg. Alleen `clientnummer` als shared key.

## Twee oplossingen voor v2

### Oplossing A — JS-snippet in BS2 browser console (Phase 3 stijl)

User opent BS2 in browser, plakt een JS-snippet in DevTools console:
- Snippet draait IN browser-context (heeft sessie-cookies)
- Voert dezelfde fetch's uit, deze keer succesvol
- Schrijft JSON naar disk via download/copy

Voordeel: omzeilt auth-probleem volledig.
Nadeel: 1 stap user-actie (paste in console + download).

### Oplossing B — Node fetch met cookie-jar + initial login

Node-script doet:
1. POST naar `/login` met user's email/password → krijgt session-cookie
2. GET CSRF-token uit cookie
3. Fetcht endpoints met cookie + CSRF-header

Nadeel: vereist user's email/wachtwoord in env-var. Onveilig.

### Aanbevolen aanpak: **Oplossing A** (JS-snippet)

Voor v2 sessie:

1. User opent BS2 in browser
2. User opent DevTools → Console
3. User plakt het JS-snippet uit `scripts/bs2-browser-snippet.js` (te bouwen)
4. Snippet fetcht alle endpoints (gebruikt cookies van zelfde browser-tab)
5. Snippet roept `JSON.stringify` aan en kopieert naar clipboard OF doet auto-download
6. User saved als `scripts/bs2-exports/bs2-export-full.json`
7. Run `node scripts/bs2-full-import.mjs` (zelfde als nu)
8. Run `node scripts/bs2-fk-resolve.mjs`

Plus: bij Phase 5 import-run wordt `bs2_id` actief opgeslagen in elke `<entity>.data.bs2_id` voor later matchen.

## Huidige toestand acceptabel

BS1 ↔ BS2 count-verschillen (gemeten 2026-05-12):
| Tabel | BS2 | BS1 | Δ | Impact |
|---|---:|---:|---:|---|
| medewerkers | 100 | 102 | +2 | Triviaal — 2 BS1-records extra |
| cliënten | 87 | 92 | +5 | Triviaal — 5 BS1-records extra of BS2-deletes |
| beschikkingen | ~251 | 249 | -2 | Triviaal |

**Conclusie**: BS1 is volledig functioneel. Alle features werken. Data-volume is correct binnen ±5 records. Geen blocker.

## Niet uitvoeren

- `scripts/bs2-fetch.mjs` — werkt niet zonder cookies; markeren als "auth-debug nodig" in comment
- `scripts/bs2-fix-client-id.mjs` — kan pas werken na nieuwe import met `bs2_id` mapping

## TODO voor v2 (geplande Phase 5 als nodig)

1. Maak `scripts/bs2-browser-snippet.js` — JS-snippet voor BS2 console
2. Update `scripts/bs2-full-import.mjs` om `bs2_id` op te slaan in `data` jsonb
3. Refactor `bs2-fix-client-id.mjs` om `data.bs2_id` te gebruiken
4. Test op productie met verse Bearer-token sessie

**Effort schatting**: ~2-3 uur dedicated debug-sessie. Niet nu nodig (geen blocker).
