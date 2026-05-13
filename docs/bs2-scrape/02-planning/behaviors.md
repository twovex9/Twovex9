# Module 02: Planning — gedrag per actie

**Gescraped op**: 2026-05-13 (batch 1)
**Pass-status**: 6 acties getest in batch 1. ~20 acties open voor batch 2.

## Actie 1: Klik "+ Dienst aanmaken" knop (toolbar rechts)

**BS2-trigger**: klik op donkere primary-knop "+ Dienst aanmaken" rechtsboven in toolbar.

**BS2-respons**:
- **Slide-in panel** vanaf rechts (geen centered modal, geen volledige overlay)
- H1: "Dienst aanmaken"
- 12 form-velden (zie `structure.md`)
- Rich-text editor met 8 formatter-knoppen
- "Herhaling" sectie met toggle
- Footer: "Annuleren" + "Toevoegen" knoppen
- Close X rechtsboven
- Klik buiten panel (op de overige content) sluit panel ja/nee — te testen batch 2
- Cancel werkt
- Submit-test alleen met valide data → BS2 maakt dienst aan + verschijnt in grid

→ BS1: dezelfde slide-in pattern of centered modal (huisstijl `.modal-overlay` + `.modal-card`)

## Actie 2: Klik "Genereren" knop

**BS2-trigger**: klik op "Genereren" knop in toolbar.

**BS2-respons**:
- **Full-screen overlay** (geen modal, neemt hele viewport)
- Header: "AI Planning · Selecteer sjabloon"
- 5-stappen wizard (zie structure.md)
- Stap 1 toont 2 panels naast elkaar (sjablonen + conceptroosters)
- Volgende-knop disabled tot sjabloon geselect
- Close X rechtsboven sluit wizard

→ BS1-implicatie: AI-feature. Vervangen door rule-based template-applier via Supabase Edge Function. Of skip voor MVP.

## Actie 3: Klik "Optimaliseren" knop

**BS2-trigger**: klik op groene "Optimaliseren" knop in toolbar.

**BS2-respons**:
- Full-screen overlay
- Header: "AI · Planning optimaliseren"
- 2-stappen wizard (Configureren → Controleren)
- Stap 1: form met Startdatum + Einddatum + Locatie + Medewerkers segmented control
- "Optimaliseren met AI" knop disabled tot locatie geselect
- Close X rechtsboven

→ BS1-implicatie: rule-based optimizer via Supabase Edge Function (medewerkers-toewijzing op basis van competenties + beschikbaarheid + voorkeuren). Geen externe AI.

## Actie 4: Klik "Maand" period-toggle

**BS2-trigger**: klik op "Maand" knop in toolbar.

**BS2-respons**:
- View wijzigt van Week-grid naar Maand-kalender
- Header-titel verandert van "Week 20 May 2026" naar "May 2026"
- **KPI-cards worden leeg** (geen aggregatie in Maand-view!)
- Per dag-cel: aantal-badge rechtsboven + diensten-lijst (kleur-dot per type) + "See all..." link
- 5 weken zichtbaar (W18-W22)
- Vandaag-dag accent (blauw)

**Belangrijke ontdekking**: KPI-cards aggregeren ALLEEN in Week-view. Maand-view is overzicht-only.

→ BS1: zelfde gedrag impl: Week-view = KPI aggregaat + grid, Maand-view = kalender zonder KPI.

## Actie 5: Klik "Week" period-toggle (terug)

**BS2-trigger**: klik op "Week" knop.

**BS2-respons**: terug naar week-view met KPI-cards opnieuw gevuld.

## Actie 6: Klik op nieuws-card / dienst-cell — NIET GETEST IN BATCH 1

Te scrapen in batch 2.

## Actie 7: Klik op group-header (Achterwacht / Breedstraat) — NIET GETEST IN BATCH 1

Te scrapen in batch 2. Mogelijk collapse/expand of detail-pagina.

## Actie 8: Klik op filter-radio (Toegewezen / etc.) — NIET GETEST IN BATCH 1

Te scrapen in batch 2. Impact op grid-data (filter toepast).

## Actie 9: Klik "Exporteren" knop in sidebar — NIET GETEST IN BATCH 1

Te scrapen in batch 2. Vermoedelijk CSV/Excel download (matcht v2 Sprint 5).

## Actie 10: Klik "Vandaag" / prev / next datum-knoppen — NIET GETEST IN BATCH 1

Te scrapen in batch 2. URL/state-update bij date-navigation.

## Edge cases — NIET GETEST IN BATCH 1

- Lege week (geen diensten) — bevestigen wat lege-state toont
- Network-error bij dienst-aanmaak
- Submit met ongeldige data (verplicht veld leeg) → validatie-melding
- Sessie-verloop tijdens scheduling-actie
- Conflict (2 medewerkers in zelfde tijd-slot)
- "Herhaal dienst" toggle aan → herhalings-config (frequency/until)

## Te testen in batch 2

Zie `structure.md` "Te scrapen in batch 2" lijst (25 punten).
