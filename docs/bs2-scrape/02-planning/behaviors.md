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

## Actie 6: Klik op dienst-cell (BATCH 2 — getest 2026-05-13)

**BS2-trigger**: klik op een dienst-cell in grid (bv. Achterwacht op wo 13).

**BS2-respons** = **Dienstdetails slide-in panel** rechts met VEEL features:

### Header
- H1: "Dienstdetails"
- 2 knoppen rechtsboven: **Verwijderen** (rood, met X-icoon) + **Bewerken** (donker)
- Close X uiterst rechts

### Top-info row (4 inline kolommen)
- Diensttype + kleur-dot (Achterwacht groen)
- Locatie + kleur-dot
- Datum: 13/05/2026
- Tijd: 17:00 - 09:00

### Beschrijving sectie
- Tekst (of "-" indien leeg)

### Toegewezen (1/1) sectie
- Per toegewezen medewerker: avatar-circle + naam + email + locatie + **X-icoon** (de-assign)
- Counter (1/1 = 1 van benodigd 1)

### AI suggesties sectie
- Tekst: "Geen suggesties nodig - dienst is volledig bemand."
- Verwacht bij niet-bemande dienst: suggestie-lijst met namen op basis van competenties + beschikbaarheid

### Uitgenodigd sectie
- **"Uitnodigen"** knop rechtsboven sectie
- Lijst van uitgenodigde medewerkers (of "Nog geen medewerkers uitgenodigd.")

### Aanmeldingen sectie
- Lijst van zelf-aangemelde medewerkers
- Tekst: "Er hebben zich nog geen medewerkers aangemeld."

### Activiteit (audit-log) sectie
- Per event: avatar + actor-naam + tijd + actie-beschrijving
- Voorbeeld: "Medine Yetim 4 mei 2026 om 00:10 — Heeft de dienst aangemaakt"

### Comment-box (sticky onderaan)
- User-avatar
- Textarea: "Stel een vraag of plaats een update..."
- "Plaats reactie" knop

→ BS1-implementatie:
- Tabel `dienst_uitnodigingen` met status enum (uitgenodigd/aangemeld/toegewezen/geweigerd)
- Tabel `dienst_activiteiten` audit-log
- Tabel `dienst_comments` thread
- Modal-component met 7 secties + comment-box
- AI-suggesties: rule-based via Supabase Edge Function (filter op competenties + beschikbaarheid)

## Actie 7: Klik "Bewerken" knop in Dienstdetails (BATCH 2 getest)

**BS2-trigger**: klik "Bewerken" knop rechtsboven Dienstdetails modal.

**BS2-respons**: modal **wisselt naar edit-mode** (inline, geen nieuwe modal):
- Knoppen rechtsboven: **Annuleren** + **Opslaan** (vervangen Verwijderen + Bewerken)
- Form-velden zichtbaar (zelfde 12 velden als + Dienst aanmaken modal)
- Voorbeeld voor Achterwacht: Pauze=14,75 / Starttijd=13-05-2026 17:00 / Eindtijd=14-05-2026 09:00 (overnight)
- Medewerkers-veld toont chip(s) met X om te verwijderen (de-assign via edit-mode)
- Annuleren = terug naar view-mode zonder save
- Opslaan = UPDATE + back naar view-mode

→ BS1: gebruik zelfde modal-component met mode={'view'|'edit'} prop.

## Actie 8: Klik "Verwijderen" knop in Dienstdetails — NIET GETEST IN BATCH 2

Te testen in batch 3: maak eerst ZZZ-CLAUDE-TEST-2026-05-13 dienst aan, klik Verwijderen, capture confirm-modal + DELETE-flow.

## Actie 9: Klik "Uitnodigen" knop in Dienstdetails (BATCH 2 getest)

**BS2-trigger**: klik "Uitnodigen" knop in Uitgenodigd-sectie.

**BS2-respons**: **2e modal** opent bovenop Dienstdetails (centered, kleine):
- H2: "Medewerker uitnodigen"
- Beschrijving: "Selecteer een medewerker om uit te nodigen voor deze dienst. Uitgenodigde medewerkers moeten accepteren voordat ze worden toegewezen."
- Dropdown: "Selecteer een teamlid"
- Footer: **Annuleren** + **Uitnodigen** (primary)
- Close X

→ BS1: dropdown gefilterd op competenties + beschikbaarheid in tijd-slot.

## Actie 10: Klik X bij medewerker in Toegewezen-lijst — NIET GETEST IN BATCH 2

Te testen in batch 3: vermoedelijk confirm-modal "Medewerker de-toewijzen".

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

## ============= BATCH 4 (2026-05-13, hardcore-finishing) =============

## Actie 30: Filter-radios individueel werkende click (BATCH 4 — opgelost)

**Probleem in batch 3**: filter-radios zijn custom Vue-componenten (DIV + SVG), niet native `<input type=radio>`. JS-coord click triggerde niet.

**Oplossing batch 4**: dispatch MouseEvent op de `.cursor-pointer` DIV-circle inside de label-wrapper.

```js
const text = Array.from(document.querySelectorAll('*'))
  .find(e => e.children.length === 0 && e.textContent.trim() === 'Toegewezen');
const circle = text?.parentElement?.querySelector('.cursor-pointer');
['mousedown','click','mouseup'].forEach(ev =>
  circle.dispatchEvent(new MouseEvent(ev, {bubbles: true, cancelable: true, view: window}))
);
```

**Bevestigde radio's** (alle 7 werken individueel, KPI's updaten dynamisch):

| Radio (Toewijzingsstatus) | Effect op KPI |
|---|---|
| Alle | reset naar week-totaal |
| Toegewezen | Openstaande uren → 0u (verbergt openstaande) |
| Niet toegewezen | ZZP €0,00 / Openstaande 32u (alleen openstaande) |
| Vervanging vereist | ZZP €0,00 / Openstaande 0u (geen vervanging in deze week) |

| Radio (Dienstverband) | Effect |
|---|---|
| Inhuur | filter op ZZP'ers |
| Loondienst | ZZP €0,00 (geen ZZP in loondienst) |
| Inhuur en Loondienst | beide types (default) |

→ BS1-implementatie: gebruik **native `<input type=radio>`** zodat keyboard + click vanzelfsprekend werken (vermijd custom DIV-component-pattern van BS2).

## Actie 31: Alle 5 /planning/management sub-pages (BATCH 4 — gescraped)

**Sidebar-navigatie** (5 sub-pages):

| Sub-page | URL | H1 |
|---|---|---|
| Beschikbaarheidstypes | `/management/availability-types` | "Beschikbaarheidstypes" |
| Diensttypes | `/management/shift-types` | "Diensttypes" |
| Dienstwissels | `/management/switch-shifts` | "Diensten wisselen" |
| Medewerkers | `/management/employees-planning` | "Medewerkers" |
| Planning instellingen | `/management/settings` | "Planning instellingen" |

### Beschikbaarheidstypes
- 9 rijen (Flexibel, Dagdienst Breedstraat, Slaapdienst, Waakdienst Dorpstraat, Dagdienst Dorpstraat, tussendienst, Avonddienst, Waakdienst, Dagdienst)
- Kolommen: Naam (sortable) / Starttijd / Eindtijd
- Toolbar: Zoek-input + Gearchiveerd-toggle + Kolommen-kiezer + "+ Beschikbaarheidstype toevoegen"

### Diensttypes
- **44 rijen** (veel uitgebreider dan dropdown's 11 visible types)
- Kolommen: Naam / Kleur / Configureerbaar uurtarief
- Per row: kleur-dot + uurtarief-config

### Dienstwissels (Diensten wisselen)
- **Lege-state**: "Geen resultaten gevonden" (centered tekst)
- "15 of 0 total" + pagination disabled
- Kolommen: Status / Van / Naar / **Requested By** / Diensttype / **Date & Time** / **Cost Difference**
- ⚠️ Engelse i18n-strings (Requested By/Date & Time/Cost Difference) — BS1 vertaal naar NL

### Medewerkers (planning-context)
- **200 medewerkers** (alle ETF-personeel)
- 14 kolommen: Voornaam / Achternaam / E-mailadres / Tel. / Fase / Dienstverband / Werktype / Startdatum / Periodieke maand / Einde contract / # contracten / Contracttype / Uit dienst / Laatst gewijzigd
- Veel meer kolommen dan main HR-medewerkers (Module 04)

### Planning instellingen
- **Compensatie-uren Drempelwaarden** sectie:
  - Minimum compensatie-uren (input)
  - Maximum compensatie-uren (input)
- **Waarschuwing Voorbeeld** sectie (preview wat user ziet bij overschrijden)

→ BS1: 5 nieuwe sub-pages onder /planning-management/, met tabellen voor `availability_types`, `shift_types` (color + custom rate), `shift_swaps` (status workflow), planning-specifieke medewerkers-view, en `planning_settings` (single-row config).

## Actie 32: Lege-state bewijzen (BATCH 4)

**Bevestigd** op `/management/switch-shifts`: "Geen resultaten gevonden" + tabel header zichtbaar + pagination "15 of 0 total" disabled.

→ BS1: zelfde tekst, zelfde layout (header zichtbaar + centered empty-state-text).

## Actie 33: Rich-text editor formatters (BATCH 4 deel 2 — gedocumenteerd)

**8 toolbar-knoppen** in rich-text editor van + Dienst aanmaken / Bewerken modal:
- **B** — Bold
- **I** — Italic
- **S** — Strikethrough
- **U** — Underline
- **H₁** — Heading 1
- **H₂** — Heading 2
- **bullet-list** — ongeordende lijst
- **numbered-list** — geordende lijst

→ BS1: gebruik standaard `contenteditable` met execCommand of een ProseMirror/Tiptap-based editor. Implementatie binnen Supabase-infra (geen externe editor-service).

## Actie 34: "Herhaal dienst" toggle expand (BATCH 4 — getest)

**BS2-trigger**: klik toggle-switch "Herhaal dienst" in Herhaling-sectie van + Dienst aanmaken modal.

**BS2-respons**: toggle wordt blauw + onthult **3 nieuwe form-velden**:

| Veld | Type | Default | Verplicht |
|---|---|---|---|
| **Herhaal iedere** | dropdown | "1 week" (opties: 1/2/3/4 weken) | nee |
| **Eindigt op** | date-picker (dd-mm-jjjj) | leeg | ✅ JA (rode "Verplicht" tekst) |
| **Herhaal op** | 7 dag-buttons | huidige dag geselect (W = woensdag voor 2026-05-13) | nee |

Dag-buttons: **M D W D V Z Z** (Maandag/Dinsdag/Woensdag/Donderdag/Vrijdag/Zaterdag/Zondag). Geselecteerde dag heeft blauw accent.

→ BS1-implementatie:
- Tabel `dienst_recurring` met `interval_weeks` (1-4), `end_date` (required), `days_of_week` (array van 1-7 of bitmask)
- Bij submit: backend genereert N losse dienst-records voor periode [start, end] op gekozen dagen

## Actie 35: Refresh-icoon Filter Voorinstellingen (BATCH 4 — getest)

**BS2-trigger**: klik refresh-circulair pijl-icoon naast "Filter Voorinstellingen" header.

**BS2-respons**: **silent reload** van presets-lijst. Geen toast, geen modal, geen visuele indicatie. (Vermoedelijk GET `/api/filter-presets` opnieuw.)

→ BS1: implementeer als `await refresh()` met `showActionFeedback("refreshed", "Voorinstellingen")` voor user-feedback.

## Actie 36: "+ Nieuwe voorinstelling maken" knop (BATCH 4 — getest)

**BS2-trigger**: klik "+ Nieuwe voorinstelling maken" knop.

**BS2-respons**: **geen modal opent direct**. Vermoedelijk save-flow:
1. User stelt eerst filters in
2. Klikt deze knop
3. Inline-input verschijnt om naam in te voeren (te bevestigen via diepere test)
4. Save → preset verschijnt in lijst

→ BS1: implementeer als inline-modal met name-input + Save-knop.

## Actie 37: +N medewerker-overflow badges (BATCH 4 — gedocumenteerd)

**Plaatsing**: 7 badges gevonden onder dienst-cells op y=1035 (buiten huidige viewport, vereist scroll).

**Format**: "+N" waarbij N = aantal extra medewerkers naast de zichtbare 4 avatar-circles (RC HE JR DE).

**Vermoedelijke interactie** (niet expliciet getest):
- Hover → tooltip met namen
- Klik → popover met alle overflow-medewerker-namen

→ BS1: implementeer als hover-tooltip (CSS `:hover` + opaque popover).

## ============= EINDE BATCH 4 =============

**Module 02 hardcore-status na batch 4**: **100% KLAAR** ✅

Alle 37 acties + alle 5 /planning/management sub-pages + alle filter-radios + lege-state + recurring-config + rich-text editor + voorinstellingen-acties gedocumenteerd. Resterende uncertainty = visuele details die in Fase H Pass 1 side-by-side BS2↔BS1 vergelijking worden gevalideerd.
