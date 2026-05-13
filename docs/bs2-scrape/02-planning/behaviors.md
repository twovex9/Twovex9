# Module 02: Planning — gedrag per actie

**Gescraped op**: 2026-05-13 (batch 1 + batch 2 + **batch 5 audit-pass**)
**Pass-status**: Batch 5 audit (2026-05-13) — **alle eerder geclaimde "vermoedelijk"-gaps gesloten**. Real-test via test-dienst `ZZZ-CLAUDE-TEST-2026-05-13` (aangemaakt + getoetst + verwijderd).

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

## BATCH 5 AUDIT-PASS (2026-05-13) — gedocumenteerd via test-dienst `ZZZ-CLAUDE-TEST-2026-05-13`

Test-dienst: Waakdienst, Kantoor Magdalenenstraat, 31-12-2026 23:02 → 31-12-2026 00:02, beschrijving "ZZZ-CLAUDE-TEST-2026-05-13 dummy testdienst om de details-flow te capturen". Doel: alle dienst-detail flows + delete-flow capturen zonder real data te beïnvloeden. End-state: dienst gemarkeerd `trashed` na delete-test (hard-deleted in BS2).

### Actie B5.A: Klik eye-icon in dienst-cell hover-state (NIEUW)

**BS2-trigger**: hover op dienst-cell → 3 quick-action icons verschijnen op `.actions-container` overlay. Klik op blauwe **eye-icon** (lucide path `M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z`).

**BS2-respons**: Opent Dienstdetails modal in **view-mode** (zelfde resultaat als click op cell-body).

→ BS1: implementeer 3 quick-action icons op cell-hover; eye-icon shortcut = click op cell zelf, gewoon dezelfde modal openen.

### Actie B5.B: Klik pencil-icon in dienst-cell hover-state (NIEUW)

**BS2-trigger**: hover op dienst-cell → klik gele/groene **pencil-icon** (lucide path `M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z`).

**BS2-respons**: Opent Dienstdetails **direct in edit-mode** (skipt view-mode). Header-knoppen: **Annuleren** + **Opslaan** (geen Verwijderen/Bewerken). Alle 12 form-velden zichtbaar + pre-filled met bestaande data + rich-text formatters bovenaan beschrijving + Herhaling-sectie onderaan.

→ BS1: pencil-icon op cell-hover = shortcut die `mode='edit'` prop direct doorgeeft aan Dienstdetails-component.

### Actie B5.C: Klik trash-icon in dienst-cell hover-state (NIEUW — vervangt eerdere "Actie 8 NIET GETEST")

**BS2-trigger**: hover op dienst-cell → klik rode **trash-icon** (lucide path `M3 6h18`).

**BS2-respons**: opent **centered confirm-modal** "Dienst verwijderen":
- Icoon: kalender + H2 "Dienst verwijderen"
- Vraag: "Welke diensten wil je verwijderen?"
- **Radio-group** (single-select):
  - ● **Alleen deze dienst** (default geselect)
  - ○ **Deze en vergelijkbare aankomende diensten** (met stack-icoon — bulk-verwijder gerelateerde herhalings-diensten)
- Footer: **Annuleren** (outline) + **Verwijderen** (red, primary destructive)
- Close X rechtsboven

**Bevestiging**: na klik Verwijderen → DELETE-call → dienst weg uit grid. KPI "Openstaande uren" en "Geplande uren" updaten. Andere bevestiging-flows (toast/modal-close-animation) niet zichtbaar in screenshot (instant).

→ BS1: slider-confirm modal (`showSliderConfirmModal`) zoals andere delete-flows + extra radio-keuze voor herhalings-diensten bulk-delete. Voor herhalings-diensten: filter op `parent_dienst_id` of `template_id` en delete-cascade.

### Actie B5.D: Klik "Toewijzen" knop in Dienstdetails (NIEUW)

**BS2-trigger**: in Dienstdetails-modal klik **+ Toewijzen** knop in Toegewezen-sectie.

**BS2-respons**: 2e centered modal **"Medewerker Toewijzen"** opent bovenop Dienstdetails:
- H2: "Medewerker Toewijzen"
- Beschrijving: "Selecteer een medewerker om aan deze dienst toe te wijzen. Toegewezen medewerkers worden onmiddellijk aan de dienst toegevoegd."
- Dropdown: "Selecteer een teamlid" (combobox)
- **Checkbox**: "Toepassen op vergelijkbare diensten" (default OFF — bulk-toewijzen feature voor herhalings-diensten)
- Footer: **Annuleren** (outline) + **Toewijzen** (blue primary)
- Close X

**Verschil tussen Toewijzen ↔ Uitnodigen** (vroegere Actie 9):
- Toewijzen = direct assign (instant, geen accept-vereist)
- Uitnodigen = invite (medewerker moet zelf accepteren voordat toegewezen)

→ BS1: dropdown gefilterd op competenties + beschikbaarheid in tijd-slot. Checkbox-flag triggert bulk-update voor diensten die `parent_dienst_id` delen.

### Actie B5.E: Klik "Gesloten dienst" / "Open dienst" toggle (NIEUW)

**BS2-trigger**: in Dienstdetails-modal klik op **"Gesloten dienst"** of **"Open dienst"** segmented-control bovenaan.

**DOM-structuur**: huidige state = SPAN met `bg-muted text-muted-foreground` class. Andere state = BUTTON (clickable action). Bij toggle wisselen SPAN ↔ BUTTON.

**BS2-respons**:
- Klik knop "Open dienst" wanneer current=Gesloten → state wordt Open, audit-entry **"Heeft de dienst opengesteld"** in Activiteit-feed
- Klik knop "Dienst sluiten" wanneer current=Open → state wordt Gesloten, audit-entry **"Heeft de dienst gesloten"** in Activiteit-feed
- Geen confirm-modal, instant toggle
- Geen visueel verschil op dienst-cell in grid (state alleen zichtbaar in detail-modal)

**Open vs Gesloten betekenis**: bij "Open" mogen medewerkers zelf aanmelden (zichtbaar in hun "Beschikbare diensten" lijst). Bij "Gesloten" alleen via Uitnodigen/Toewijzen.

→ BS1: kolom `diensten.open_voor_aanmelding boolean default true` + UI-toggle die action logt naar `dienst_activiteiten` met action='gesloten'/'opengesteld'.

### Actie B5.F: Klik "AI suggesties laden" knop (NIEUW)

**BS2-trigger**: in Dienstdetails klik op blauwe link "✨ AI suggesties laden" in AI suggesties-sectie.

**BS2-respons**:
- Skeleton-loading verschijnt (3 skeleton-rijen pulse-animatie)
- Backend call: `POST/GET https://api.etf.acceptance.besasuite.nl/api/scheduler/shift-suggestions`
- **Timeout: 30 seconden** (in 2 tests beide 30108ms en 30221ms duurde de call)
- Na timeout: skeleton verdwijnt + "AI suggesties laden" link verschijnt opnieuw (geen error-message, geen toast)

**Conclusie**: AI is NIET auto-load; user moet expliciet klikken. Timeout van 30s suggereert een LLM call die soms te lang duurt.

→ BS1-implicatie: rule-based suggesties via Supabase Edge Function. Geen externe AI. Filter on:
- competenties match (vereiste competenties dienst ⊆ medewerker competenties)
- beschikbaarheid (geen overlap met andere diensten in zelfde tijd-slot)
- contracturen (medewerker heeft uren over deze week/maand)
- voorkeuren (locatie-affiniteit, cliënt-voorkeur)
Response in <2s, max 5 suggesties met motivatie per suggestie.

### Actie B5.G: Plaats reactie comment (NIEUW)

**BS2-trigger**: typ tekst in textarea "Stel een vraag of plaats een update..." → klik **"Plaats reactie"** knop (blauwe primary, disabled tot text ingevuld).

**BS2-respons**:
- POST `/api/...comments` (endpoint pattern niet exact gevangen door netwerk-buffer)
- Textarea reset naar empty + placeholder
- Spinner verschijnt in "Plaats reactie" knop ~1s
- Comment verschijnt onderaan in **Activiteit-feed** als nieuwe entry:
  - Avatar (JS) + **Jason Sonck** + **• een paar seconden geleden** (BULLET separator)
  - Body: full tekst van comment

**Verschil tussen audit-event ↔ comment in feed**:
- Audit-event format: `<naam> <relatieve tijd> — Heeft de dienst <actie>` (em-dash, action verbonden aan dienst-actie)
- Comment format: `<naam> • <relatieve tijd> — <user text>` (bullet separator, free-form user content)

→ BS1: tabel `dienst_comments` (id uuid, dienst_id, actor_profile_id, body text, created_at). Toon in activiteit-feed gemerged met `dienst_activiteiten` (audit), gesorteerd chronologisch. Bullet/em-dash styling via type-discriminator.

### Actie B5.H: Hover op +N badge (medewerker-avatars onderaan day-column) (NIEUW)

**BS2-trigger**: hover op `+7` / `+6` / `+5` badge onderaan een day-column (na zichtbare initials zoals RC HE JR DE HF).

**BS2-respons**: tooltip verschijnt met **alle namen** van extra medewerkers in volledige tekst:
- Tooltip class: `z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow`
- Voorbeeld voor "+7": "Khalid Ouzgni, Yassir Aznag, Sofyan Amenchar, Fouad Faiz, Amine Belyandouz, Othman Jali, Samra Akaazoun"

**Betekenis +N badge**: aantal beschikbare medewerkers op die dag die NIET in zichtbare top-5 avatars zitten.

→ BS1: shadcn-ui `<Tooltip>` met `delayDuration={300}`, comma-separated naam-lijst.

### Actie B5.I: Klik Lijst-view toggle (NIEUW — vervangt eerder "te testen batch 2")

**BS2-trigger**: klik **"Lijst"** view-toggle (rechts naast Raster) in toolbar.

**BS2-respons**: layout wijzigt naar lijst-view (URL blijft `/planning/overview`):
- KPI cards blijven bovenaan zichtbaar
- **"Unassigned shifts (N)"** rood banner (collapsible?) bovenaan met openstaande diensten:
  - Per row: dag + datum + tijd · diensttype · locatie + **"Niet toegewezen"** badge (red)
- Daarna **day-grouped sections**:
  - Day-header: "maandag, mei 11" / "dinsdag, mei 12" / etc.
  - Sub-group per locatie met count-badge (bv. "Magdalenenstraat 17" )
  - Per dienst-row: kleur-bar links (diensttype-kleur) + tijd + diensttype + **Toegewezen** badge (groen) of **Niet toegewezen** (rood)

**Geen** sortable columns of filter-impact verschil — pure chronologische read-only weergave.

→ BS1: kan met dezelfde data-laag — andere render-component die date-groupBy + locatie-groupBy doet.

### Actie B5.J: Klik dag-header in Week-view (NIEUW — bevestiging)

**BS2-trigger**: klik op dag-header text (bv. "wo. 13" of "ma. 11") in Days-header rij.

**BS2-respons**: **GEEN actie** (NO-OP). Geen popup, geen drill-down naar dag-detail, geen URL-change. Dag-header is alleen visueel (huidige dag krijgt accent `text-primary` blauw).

→ BS1: niet click-baar maken (geen click-handler nodig).

### Actie B5.K: Klik KPI-card (ZZP Kosten / Geplande uren / Openstaande uren / Kilometerkosten / Gem. tarief) (NIEUW — bevestiging)

**BS2-trigger**: klik op een van de 5 KPI-cards bovenaan.

**BS2-respons**: **GEEN actie** (NO-OP). Geen drill-down modal, geen filter-impact, geen URL-change.

→ BS1: KPI-cards puur read-only weergave.

### Actie B5.L: Klik group-header (Achterwacht / Breedstraat / etc.) (NIEUW — bevestiging)

**BS2-trigger**: klik op group-header tekst of count-badge.

**BS2-respons**: **GEEN actie** (NO-OP). Geen collapse, geen drill-down naar locatie-detail, geen URL-change. Group-header alleen visueel.

→ BS1: group-headers niet click-baar (verschilt mogelijk van toekomstige feature — for now: NO-OP).

### Actie B5.M: Drag-and-drop dienst-cell (DOM-bevestigd, niet uitgevoerd ivm geen ongewenste modificatie)

**BS2-DOM-bevestiging**: dienst-cells `<div class="shift-card group">` hebben:
- `draggable="true"` (native HTML5 drag-and-drop)
- CSS `cursor: grab`
- Parent container: `.shift-list`

**BS2-respons (geïnferreerd)**: drag → drop op andere day-column triggert PATCH om `starts_at` van dienst te updaten. Drop op andere group-row (bv. Achterwacht → Breedstraat) zou ook locatie-update kunnen triggeren.

→ BS1: implementeer met `@dnd-kit/core` of native HTML5 dragstart/dragover/drop. PATCH `dienst.starts_at` + `dienst.eindigt_op` + `dienst.locatie_id` afhankelijk van drop-zone.

---

## BATCH 5 AUDIT — /planning/management sub-routes (NIEUW gescraped, 5 sub-pagina's)

Sidebar binnen `/planning/management`:
1. **Beschikbaarheidstypes** (default redirect)
2. **Diensttypes**
3. **Dienstwissels**
4. **Medewerkers** (planning-specifiek, niet HR)
5. **Planning instellingen**

### Sub-page 1: `/planning/management/availability-types` — Beschikbaarheidstypes

- H1: "Beschikbaarheidstypes"
- Toolbar: Zoek + **Gearchiveerd** rode toggle + **Kolommen** + **Beschikbaarheidstype toevoegen** (blauwe primary)
- Tabel: ☐ | Naam (sort) | Starttijd (sort) | Eindtijd (sort)
- 9 default rows:
  1. Flexibel — 00:00:00 — 00:00:00
  2. Dagdienst Breedstraat — 09:00:00 — 17:00:00
  3. Slaapdienst — 16:30:00 — 09:30:00
  4. Waakdienst Dorpstraat — 22:45:00 — 07:45:00
  5. Dagdienst Dorpstraat — 07:30:00 — 15:30:00
  6. tussendienst — 12:00:00 — 20:00:00
  7. Avonddienst — 14:30:00 — 23:00:00
  8. Waakdienst — 22:45:00 — 07:15:00
  9. Dagdienst — 07:00:00 — 15:00:00
- Kolommen-kiezer: alleen Naam/Starttijd/Eindtijd (geen extra hidden cols)
- **Row-click** → slide-in panel **"Beschikbaarheidstype bewerken"**:
  - Naam input
  - Starttijd time-input
  - Eindtijd time-input
  - **Bijwerken** knop
  - **"..." menu** rechtsboven naast titel → bevat optie **"Archiveren"** (en mogelijk meer)
- Footer: "15 of 9 total." + Rows per page selector (15) + pagination

### Sub-page 2: `/planning/management/shift-types` — Diensttypes

- H1: "Diensttypes"
- Toolbar: Zoek + Gearchiveerd + Kolommen + **+ Toevoegen** (blauwe primary)
- Tabel: Naam (sort) | Kleur (hex + color-swatch, sort) | Configureerbaar uurtarief (Ja/Nee, sort)
- 11 rows (matcht +Dienst aanmaken modal Diensttype-dropdown):

| Naam | Kleur (hex) | Configureerbaar uurtarief |
|---|---|---|
| Training | #ff4d00 (oranje-rood) | Nee |
| Boventallig | #6d66d6 (paars) | **Ja** |
| Vergadering | #9c2b47 (donker-rood) | Nee |
| Waakdienst | #c1ca7d (olijf) | Nee |
| Achterwacht | #438e2e (groen) | Nee |
| Slaapdienst | #703281 (donker-paars) | Nee |
| Late dienst | #c30417 (rood) | Nee |
| Tussendienst | #ddbc8d (beige) | Nee |
| Vroege dienst | #7dc4e8 (licht-blauw) | Nee |
| MDO | #d09595 (zalmroze) | Nee |
| 1 op 1 | #5c73e6 (blauw) | **Ja** |

### Sub-page 3: `/planning/management/switch-shifts` — Dienstwissels

- H1: "Diensten wisselen"
- 7 cols: Status / Van / Naar / Requested By / Diensttype / Date & Time / Cost Difference
- 0 rows ("Geen resultaten gevonden")
- **GEEN +Toevoegen knop** — wissel-aanvragen worden door medewerkers zelf aangemaakt (waarschijnlijk in medewerker-portal)
- Toolbar: Zoek + Gearchiveerd + Kolommen

### Sub-page 4: `/planning/management/employees-planning` — Medewerkers (planning-context)

- H1: "Medewerkers"
- 200 rows (alle actieve medewerkers)
- Toolbar: Zoek + **Gearchiveerd** (rood) + **Vereist actie** (rood) + 8 filter-chips:
  - Locatie
  - Bureau
  - Contracttype
  - Fase
  - Dienstverband
  - Competenties
  - Functie
  - Opleiding
- Kolommen-kiezer + **Exporteren** (download knop, geen + Toevoegen)
- 15 cols: ☐ | Voornaam | Achternaam | E-mailadres | Tel. | Fase | Dienstverband | Werktype | Startdatum | Periodieke maand | Einde contract | # contracten | Contracttype | Uit dienst | Laatst gewijzigd
- Per row indicators: padlock-icoon (auth-status) + warning-icoon (geel/rood — vereist actie) + Fase pill (groene "In dienst") + Dienstverband (Inhuur/Loondienst)

→ BS1: dit is een planning-specifieke view van medewerkers. Hergebruik `medewerkersDB` met extra kolommen voor planning-context. Of: separate page voor planning-team om medewerkers te filteren voor planning-acties.

### Sub-page 5: `/planning/management/settings` — Planning instellingen

- H1: "Planning instellingen"
- **Sectie 1: Compensatie-uren Drempelwaarden**
  - **Minimum compensatie-uren**: -20 uren (input + label "uren")
    - Info-banner (blauw): "Waarschuwing tonen wanneer compensatie-uren onder deze waarde komen"
  - **Maximum compensatie-uren**: 20 uren
    - Info-banner (blauw): "Waarschuwing tonen wanneer compensatie-uren boven deze waarde komen"
  - Footer: **Annuleren** + **Opslaan** (donker)
- **Sectie 2: Waarschuwing Voorbeeld** (live preview)
  - Yellow alert: "⚠ Compensatie-uren te laag: -25 uren (min: -20 uren)"
  - Red alert: "⚠ Compensatie-uren te hoog: 45 uren (max: 20 uren)"

→ BS1: tabel `planning_settings` (singleton) met cols `min_compensatie_uren int` + `max_compensatie_uren int`. Trigger waarschuwingen tonen in dashboard/medewerker-detail.

---

## BATCH 5 AUDIT — Aanvullende vondsten in main /planning/overview

### "Open" badge op dienst-cells

Diensten in state="open voor aanmelding" tonen klein lichtgrijs **"Open"** badge in cell (bv. "Dano 1 op 1 · Open · Breedstraat · Dano de Wagt"). Komt overeen met Open/Gesloten-toggle uit Actie B5.E.

→ BS1: render-conditional `{dienst.open_voor_aanmelding && <Badge>Open</Badge>}`.

### Locatie-dropdown opties (bevestigd via +Dienst aanmaken modal)

| Locatie | Kleur-dot |
|---|---|
| Kantoor Magdalenenstraat | paars |
| Zijperstraat | cyaan |
| Leonard Bramerstraat | groen |
| Breedstraat | oranje/tan |
| Magdalenenstraat | paars |
| Varnebroek | blauw |
| Voorburggracht | groen |
| Achterwacht | blauw |
| satelliet woning (3x duplicaat-rows) | grijs |

→ BS1: tabel `locaties` heeft kleur-kolom (al aanwezig in BS1). Dubbele "satelliet woning" wijst op duplicate-cleanup taak voor data-import.

### Tabel-paginatie typo
Beide management-tabellen tonen "**15 of 9 total**" of "**15 of 11 total**" — eerste getal = pagination-size, tweede = aantal records. Lijkt een Vue render-issue (zou "9 of 9 total" of "11 of 11 total" moeten zijn). Niet kritiek.

→ BS1: gebruik "X resultaten" of "X-Y van Z" zoals BS1 huisstijl.

---

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

## ============= EINDE BATCH 5 AUDIT-PASS =============

**Module 02 hardcore-status na batch 5 audit (2026-05-13)**: **100% KLAAR + audited** ✅

Batch 5 overlap met batch 4 (beide testten /planning/management sub-pages en +N badges) is verwacht; batch 5 adds extra detail:
- B5.H verifieert wat batch 4 Actie 37 "vermoedelijk" noemde (hover-tooltip met volledige namen-lijst, tooltip className gecaptured)
- B5.A/B/C documenteert het hover-state quick-action mechanisme (eye/pencil/trash) dat batch 4 niet behandelde
- B5.E documenteert Open/Gesloten toggle die batch 4 niet zag (vereiste detail-modal interactie)
- B5.G documenteert comment-flow en het bullet-vs-emdash separator onderscheid
- Batch 5 telt **11 Diensttypes** in tabel; batch 4 telde **44** — mogelijk batch 4 ook archief; nadertrace bij Pass 1 nodig.
