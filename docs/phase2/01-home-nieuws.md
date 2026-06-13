# Phase 2 — Sectie 1: Home / Nieuws

**Datum**: 2026-05-12
**Status**: ✅ Compleet

## Doel
Eerste validatie van de port-loop. BS2 nieuws-feed → BS1 home + nieuws.html.

## Bevindingen — pre-build

| Component | BS2 | BS1 | Gap |
|---|---|---|---|
| Schema | titel, body, auteur, datum | `public.nieuws` met: id (uuid), titel, status, auteur (text), inhoud (text/html), image, image2, archived, datums | Geen — schema dekt alles |
| Display page | Vertical feed met cards | `home.html` met `home-news-grid`, card-rendering in `home.js` | Geen — werkt |
| Admin page | onbekend (waarschijnlijk via /hr/announcements) | `nieuws.html` + `nieuws.js` bestaan en werken live op `futureflow-app.vercel.app/nieuws.html` | Geen — werkt |
| Data layer | n.v.t. | `nieuws-data.js` met add/update/archive/restore/delete CRUD via Supabase | Geen — werkt |

## Werk uitgevoerd
- Schema-check verbose `list_tables` → bevestigt `public.nieuws` heeft alle benodigde velden
- 3 nieuwsberichten geport van BS2 naar BS1 Supabase via `mcp__supabase__execute_sql`:
  - `463be365-2db1-450c-ba17-bace1d7407a5` — "Bijeenkomst over schulden met Zaffier" (Donovan Austin, 2026-05-11)
  - `bc1171ee-388d-4829-b65c-ab368f9138ec` — "Uitbetaling vakantiegeld en CAO-verhoging in mei" (Valerie Koster, 2026-05-08)
  - `43218371-790b-4b33-8271-44b2209d6af7` — "Verplichte e-learning: Werken met de meldcode in de jeugdzorg" (Valerie Koster, 2026-05-06)
- Bodies opgemaakt met `<p>`-tags voor BS1 rich-text rendering
- Verify: BS1 `futureflow-app.vercel.app/home.html` toont alle 3 items klikbaar, met preview-text, auteur en datum

## Code-wijzigingen
**Geen.** Alle BS1 infrastructuur bestond al. Alleen data-porten.

## Visuele verschillen (cosmetisch, vrij oordeel)
- Welkomstgroet: BS1 toont email-fallback omdat profiel `voornaam` niet ingevuld is (user-actie nodig)
- Datum-format: BS1 `dd-mm-yyyy hh:mm` vs BS2 `mmm dd, yyyy` (NL korte maand)
- Auteur-styling: BS1 plain text vs BS2 initialen-avatar (DA/VK/LA)
- Layout: BS1 responsive card-grid vs BS2 vertical feed

Deze verschillen vallen onder "vrij oordeel" (zie feedback memory) en zijn niet binnen scope van deze sectie-port.

## Lessons learned
- **Niet elke sectie vraagt build-werk.** Soms is BS1 al voorbereid door eerdere ontwikkeling en is alleen data-porting nodig.
- Pre-flight check `list_tables` (verbose) → onmisbaar voor accurate schema-gap analyse.
- `get_page_text` matches op `<article>` element; nieuws-cards in `home.js` zijn `<article class="home-news-card">` dus modal-template `<article>` werd prioriteit boven de feed. **Voor verificatie altijd `read_page filter=all` gebruiken** ipv `get_page_text`.

## Volgende stap
Sectie 2: HR/Medewerkers parity check.
