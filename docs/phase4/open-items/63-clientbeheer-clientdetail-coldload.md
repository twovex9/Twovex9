# 63 — Client-detail koude-direct-load (lesson #13 herhaling)

**Status:** ✅ OPGELOST 2026-05-28 (PR #387 + #389), live geverifieerd met 2 clean runs.
Oorspronkelijk gevonden tijdens live-verificatie Clientbeheer-sprint; pre-existing
lesson #13 sessie-rehydratie/anonieme-RLS kwestie, niet veroorzaakt door de sprint.

## Oplossing (toegepast)
1. **PR #387** — `clienten-data.js fetchAll()` wacht nu op `window.besaSupabaseReady`
   vóór de eerste SELECT → de query draait niet meer anoniem (0 rijen) bij een
   koude load; de cliëntenset komt betrouwbaar binnen.
2. **PR #388** — `?v=`-bump op alle 16 pagina's die `clienten-data.js` laden, zodat
   browsers de gefixte versie ophalen (Vercel rewrite't `?v=` naar de deploy-hash).
3. **PR #389** — loop-proof reload-vangrail in `client-detail.js`: reload hooguit
   één keer per cliënt per sessie (sessionStorage-vlag), zodat een volle
   localStorage-quota geen oneindige reload-lus meer kan veroorzaken.

**Verificatie (Chrome MCP):** quota leeggemaakt + `clientenItems` gewist → koude
directe navigatie naar `client-detail?id=...` laadt de cliënt correct
(hoofdaannemer-dropdown, cache 86), 2× identiek, 0 app-console-errors.

---

## Oorspronkelijke bevinding (historie)

## Symptoom
Een **directe** navigatie naar `client-detail?id=...` (zonder eerst de cliëntenlijst te
bezoeken, of met lege localStorage-cache) kan de cliënt niet tonen: `clientenDB.getAllSync()`
blijft `0`, de pagina toont "Cliëntdossier" + de "niet gevonden"-tekst. De bestaande
reload-vangrail (`besa:clienten-updated` → `location.reload()`, client-detail.js ~r.224-242)
herstelt niet wanneer de Supabase-client de sessie niet (op tijd) rehydrateert → de
`to authenticated`-RLS-query geeft 0 rijen **zonder error** (anoniem).

## Waarom niet de Clientbeheer-sprint
- De vroege `return` (client-detail.js r.241) draait **vóór** de PR #3-hoofdaannemer-code.
  Een toegevoegd formulierveld kan de datalaag niet leegmaken.
- Via het normale pad (cliëntenlijst → rij klikken → detail, warme cache) laadt
  client-detail volledig correct incl. hoofdaannemer-dropdown (live geverifieerd, RUN #1).
- `beschikking-detail` kreeg in deze sprint wél een cold-start vangrail (PR #385) omdat het
  daar volledig ontbrak; client-detail heeft al een (reload-gebaseerde) vangrail.

## Oplossingsrichting (apart, buiten Clientbeheer-scope)
Versterk de centrale supabase-client rehydratie (zie lesson #13 / PR #289-#293):
- `supabase-client.js` rehydratie-guard betrouwbaar maken op àlle koude detail-loads
  (niet alleen lijst-pagina's), en data-lagen laten `await window.besaSupabaseReady`
  vóór hun eerste query.
- Eventueel client-detail's reload-vangrail vervangen door een data-laag self-heal
  (refresh + her-render i.p.v. `location.reload()`), analoog aan de beschikking-detail
  vangrail uit PR #385.

## Reproductie
1. Wis `localStorage["clientenItems"]` (of gebruik een verse browser-sessie).
2. Navigeer direct naar `client-detail?id=<bestaand-id>`.
3. Observeer: blijft op "Cliëntdossier", `clientenDB.getAllSync().length === 0`.
