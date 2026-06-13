# Module 13 — HR Nieuws — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/hr/announcements`
**BS1 URL**: `https://futureflow-app.vercel.app/nieuws.html`
**Scrape datum**: 2026-05-14

## BS2 page top-level

- title: `Nieuws | Embrace The Future`
- h1: **Nieuws**
- HR-sidebar positie: laatste item (na Verzuim)

## Toolbar

- **Zoeken-input** (placeholder "Zoeken...")
- **Gearchiveerd-toggle** (switch yellow)
- **Kolommen-knop** (rechts)
- **+ Nieuws toevoegen** (primary, rechts)

## Tabel (4 kolommen)

| Kolom | Sortable | Inhoud |
|---|---|---|
| (select checkbox) | nee | Multi-select |
| Titel | ✓ asc/desc/hide | Klikbaar → opent detail-page (BS2) of modal (BS1) |
| Status | ✓ asc/desc/hide | Pill: "Published" |
| Aanmaakdatum | ✓ asc/desc/hide | DD-MM-YYYY HH:MM |

## Detail-page / Edit-modal

### BS2 (separate page)
- URL: `/hr/announcements/{id}/details`
- h1 = titel item
- Velden: Naam (text input) + Inhoud (RTE-textarea)
- Image upload (file input)
- 2 actie-knoppen rechtsboven: Publiceer / Wijzigingen opslaan

### BS1 (modal `#news-edit-modal`)
- Class: `modal-overlay modal-overlay--news-edit`
- Layout: full-page editor met `.news-edit-shell` (aside + main)
- Aside: hero met Terug (←) + Meer-opties (kebab) + titel
- Main: Naam input + RTE-editor (B/I/S/U/H1/H2/🔗/lijst/uitlijning)
- Buttons: Publiceer / Wijzigingen opslaan
- Close-ways: Terug-knop ✅, Escape ✅, Overlay-click ✅ (geen X — design-choice)
- Meer-opties popover (Bug #37 fix): Archiveren of Herstellen+Definitief verwijderen

## Add modal (`#news-add-modal`)

- Velden: Afbeelding (file), Naam (text), Geplaatst door (text), Inhoud (RTE)
- Close-ways: X / Escape / Overlay
- Submit: Toevoegen-knop

## Delete modal (`#news-delete-modal`)

- Type: archive-confirmation (eerste klik op trash → archief)
- Class: `modal-overlay modal-overlay--confirm`
- Slider-confirm pattern
- Close-ways: X / Escape / Overlay

## Purge modal (`#news-purge-modal`)

- Type: permanent-delete (alleen op gearchiveerde items)
- Class: `modal-overlay modal-overlay--confirm`
- Slider-confirm pattern

## Schema

- Supabase tabel: `public.nieuws`
- Kolommen: id (uuid PK) / titel / status / auteur / inhoud / image / image2 / archived / aanmaakdatum / laatst_gewijzigd
- RLS: auth-only

## Status values (Bug #35 normalized)

Vóór fix: 12 "Gepubliceerd" + 3 "Published" (inconsistent)
Na fix: 15 × "Published" (matches BS2 + code-default)
