# Item 33 — Cliënt-detail Betalingen-tab geïmplementeerd

**Datum**: 2026-05-12
**Status**: ✅ Voltooid (eerste van 4 placeholder-tabs uit item 14)
**Gerelateerd**: items 14 (4 placeholders), 29 (verificatie), 1.1 uit `06-professional-finish.md`

## Wat is gedaan

De `Betalingen`-tab op `client-detail.html` is geen placeholder meer. Toont nu een echte factuur-overzicht per cliënt.

### UI

- **Samenvatting-block** (4 stats): Aantal facturen / Totaal bedrag / Betaald / Openstaand
- **Tabel** met kolommen: Factuurnummer / Periode / Beschikking / Bedrag / Status
- **Empty state**: "Geen facturen gekoppeld aan deze cliënt." (toonbaar bij cliënten zonder facturen of BS2-records zonder client_id)
- **Status badges**: hergebruikt bestaande `cd-besc-stat--betaald/--gedeclareerd/--concept` classes voor visuele consistentie met Beschikkingen-tab

### Data

Filter logica in `client-detail.js` → `renderBetalingen()`:
- Match op `facturen.client_id === clienten.id` (primair)
- Fallback: match op `facturen.clientnummer === clienten.clientnummer` (voor BS2-records waar `client_id` ontbreekt — zie open-items #1)
- Skipt gearchiveerde facturen
- Sorteert op periode descending (nieuwste eerst)

### Lazy load

Tab-content wordt alleen gerenderd wanneer de tab geactiveerd wordt (`setTab("p")` triggert `renderBetalingen()`). Plus live-refresh bij `ff:facturen-updated` event als de tab op dat moment actief is.

### Files gewijzigd

- `client-detail.html`: placeholder vervangen door summary + table structuur
- `client-detail.js`: `renderBetalingen()` + helpers (`escapeHtml`, `statusBadge`, `formatBedragNL`)
- `client-detail.html`: `facturen-data.js` toegevoegd aan script-load-volgorde (vóór client-detail.js)
- `styles.css`: `.cd-bet-summary`, `.cd-bet-sum-stat`, `.cd-bet-sum-lab`, `.cd-bet-sum-val`, `.cd-bet-table-card` (responsive)

## Test data

Cliënten met meeste facturen (via Supabase MCP):
- Nadia Trela (cl_322) — 15 facturen
- Divano Vrij (cl_320) — 14 facturen
- Silas Breederveld (cl_228) — 14 facturen

## Volgende stappen (item 14 nog open)

Resterende 3 placeholder-tabs uit item 14:
- **Contacten**: vereist nieuwe tabel `client_contacten` (M2M)
- **Rapportages**: vereist nieuwe tabel `client_rapportages` met text/attachments
- **Vragenlijsten**: vereist nieuwe tabel `client_vragenlijsten` met JSON-schema

Deze 3 zijn substantieel complexer (nieuwe DB-tabel + data-laag + UI). Voor v2.

## Test plan

- [ ] CI workflow groen
- [ ] Vercel deploy slaagt
- [ ] Visueel: `client-detail.html?id=cl_322` (Nadia Trela) → Betalingen-tab → toont 15 facturen + summary stats
- [ ] Visueel: cliënt zonder facturen → empty state "Geen facturen gekoppeld"
- [ ] Visueel: status badges hebben juiste kleuren (Betaald = groen, Gedeclareerd = blauw, Concept = grijs)
- [ ] Responsive: < 640px → 2-kolommen summary i.p.v. 4
