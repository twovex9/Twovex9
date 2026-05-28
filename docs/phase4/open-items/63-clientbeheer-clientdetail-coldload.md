# 63 — Client-detail koude-direct-load (lesson #13 herhaling)

**Status:** bekend issue (pre-existing), gevonden tijdens live-verificatie Clientbeheer-sprint 2026-05-28.
**Niet** veroorzaakt door de Clientbeheer-sprint (PR #377-#385) — het is de bekende
lesson #13 sessie-rehydratie/anonieme-RLS kwestie.

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
