# Facturen — BS2 functioneel model (1-op-1 referentie) — 2026-05-17

Bron: passieve DevTools-recorder `bs2-console-facturen-recorder.js` (48 calls,
user klikte Te beoordelen + Alle facturen + 4 detail + PDF + filters). BS2 =
autoritatief. Dit is een **bindend contract**: BS1 moet hier veld-voor-veld en
berekening-voor-berekening aan voldoen.

## 1. Wat is dit (≠ huidige BS1 `facturen`)

De BS2 top-bar **Facturen** (én Cliënten → Facturen → zelfde) is het
**employee-invoice**-model: een **medewerker** factureert een **organisatie**
voor gewerkte **diensten (shifts)** in een periode (maand). NIET te verwarren
met de huidige BS1 `facturen`-tabel (956 rijen) — die is het
**beschikking/disposition-payment**-model (`factuurnummer, beschikking_label,
client_id, bedrag`) en representeert deze module dus **niet**. Voor 1-op-1
BS2 moet de top-bar Facturen op het `/api/invoices`-model draaien.

## 2. Endpoints (BS2, autoritatief)

**De twee tabs zijn in BS2 ZELF al twee aparte endpoints + routes** (live
bevestigd in user-console 2026-05-17). Dit is dé reden dat ze in BS1 ook
strikt los moeten staan:

- **Te beoordelen** — route `/invoices-module/invoices-to-review`, API
  `GET /api/invoices-to-review?status=submitted&period[start]=YYYY-MM-DD&period[end]=YYYY-MM-DD&page=N&per_page=10`
  (let op: `status=` los, `per_page` i.p.v. `limit`, eigen endpoint —
  NIET `/api/invoices`). Responseshape via full-scrape vast te leggen.
- **Alle facturen** — `GET /api/invoices?with[]=organization&filter[status][]=…&filter[period][start|end]=YYYY-MM-DD&filter[search]=…&filter[trashed]=true|false&page=N&limit=15`
  — lijst, **server-side paginatie 15/pagina** (`meta.current_page/last_page/from/to/total`, `links[]`).
- `GET /api/invoices/{id}` — detail incl. `billing_fields[]` (regels),
  `workflow_transitions[]` (historie), `system_generated{}` (bron uit shifts),
  `client`, `contact_person`, `organization`, `employee`.
- `POST /api/rpc {"signature":"generate_pdf:employee-invoice","body":{"invoice":{"id":"…"}}}`
  → `{ "pdf": "<signed S3 URL>" }`. Side-by-side PDF-viewer naast de data.
- `GET /api/billing-fields` — config/voorbeeld billing-field (regel met shift).
- `GET /api/filter-presets` — opgeslagen filterpresets (planning-breed; minor).

## 3. Invoice — datamodel (lijst + detail)

`id, number, period{year,month,formatted "April 2026"}, total_excl_vat, total,
status, priority, client(meest null), contact_person(meest null),
organization{id,name,kvk,btw,iban,payment_terms,terms_conditions,logo},
employee{id,name}, vat_handling, invoice_date, expiration_date, pdf(signed S3),
sent_at, submitted_at, rejected_at, approved_at, workflow_transitions[],
can_be_submitted, can_be_edited, can_be_approved, can_be_rejected,
can_be_marked_under_review, system_generated{}, created_at, updated_at,
deleted_at`

Alleen in **detail**: `billing_fields[]`, `client`, `contact_person`,
`workflow_transitions[]`, `system_generated{}`.

`billing_fields[]`-regel: `{id, name, title("1 op 1 - Breedstraat\n9 april
08:30 - 00:30"), description, unit("Uren"), price, amount, total, order,
product, shift{…volledig dienst-object…}, comments, is_group, is_blank_row,
is_auto_generated, created_at, updated_at, snapshot_diff}`

`system_generated`: `{mode("shift_times"), period, shifts[], totals{vat,
total,total_excl_vat}, billing_summary{hourly_rate,total_hours,shifts_count},
billing_fields[], metadata, generated_at}` — de **bron-voorstel** uit de
shifts; kan AFWIJKEN van de werkelijke factuur (factuur 2: sg.total 9427,5 vs
factuur 8707,5; factuur 4: 10530 vs 9630 — regels handmatig aangepast).
Autoritatief voor de factuur = de eigen `billing_fields` + `total(_excl_vat)`.

`workflow_transitions[]`: `{id, status, comment, user{id,name}, created_at}`
(bv. `{status:"approved", comment:"Invoice approved",
user:"orpheo.parker@embracethefuture.nl", created_at}`).

## 4. Berekeningen (BINDEND — 1-op-1, bewezen tegen 4 facturen)

- Regel: `regel.total = price × amount` (46×8,5=391; 45×16=720; 42×5=210 —
  exact in alle 4 facturen).
- `total_excl_vat = Σ billing_fields.total` (factuur 1: 391·5+368=2323 ✓;
  factuur 3: Σ=8799 ✓).
- `total = total_excl_vat + BTW`. In de hele opname `vat_handling="regular"`
  met `totals.vat = 0` → `total = total_excl_vat`. BTW-bedrag volgt uit
  `vat_handling` (regular/…); bij verlegd/0% → vat 0. **Verbatim opslaan**
  (`total_excl_vat`, `total`, `vat_handling`) en niet blind 21% rekenen tot
  vat-regels bewezen zijn.
- `billing_summary`: `hourly_rate, total_hours (Σ amount), shifts_count`.

## 5. Tabs / filters (1-op-1)

- **Te beoordelen** = eigen endpoint `/api/invoices-to-review` (route
  `/invoices-module/invoices-to-review`), params `status=submitted` +
  `period[start|end]` + `per_page` (default 10). NIET `/api/invoices`.
- **Alle facturen** = `/api/invoices` (géén status-filter = alle statussen)
  — `?with[]=organization&page=N&limit=15`.
- Beide endpoints/pagina's staan strikt LOS van de Cliënten→Beschikkingen→
  Facturen (disposition `facturen.html`, 956). Geen kruislinks.
- Statussen: `draft, submitted, under_review, approved, rejected`.
- **Periode-filter** `filter[period][start|end]=YYYY-MM-DD` → server filtert de
  lijst; getallen/totalen per factuur moeten BS2 exact volgen voor élk bereik
  (user-eis: "getallen overeen als je de datum aanduidt").
- `filter[search]` (vrije tekst), `filter[trashed]=true|false` (prullenbak).
- Sortering + `limit` (15 default) + paginatie server-side.

## 6. Beoordelen-workflow (1-op-1)

Actie-vlaggen op de factuur: `can_be_submitted, can_be_edited,
can_be_approved, can_be_rejected, can_be_marked_under_review`. Beoordelen =
status-overgang `submitted → under_review / approved / rejected` met een
`comment`; elke overgang schrijft een `workflow_transitions`-entry
(status, comment, user, created_at). `approved_at/rejected_at/submitted_at`
worden gezet.

## 7. PDF (side-by-side)

`POST /api/rpc {signature:"generate_pdf:employee-invoice",
body:{invoice:{id}}}` → verse signed S3-URL. BS2-detail toont de PDF in een
ingebedde viewer **naast** de factuurdata (user-eis). `invoice.pdf` is ook
al een (verlopende) signed URL.

## 8. Connecties (user: "sommige dingen geconnecteerd met iets anders")

- invoice → `organization` (gefactureerde firma) + `employee` (indiener)
- invoice-regel (`billing_field`) → `shift` → `{shift_type, location,
  client, start/end, break, billable_hours, …}`
- invoice → `period{year,month}` ; `workflow_transitions[].user`
- `system_generated.shifts[]` = bron-diensten van de auto-generatie

## 9. Gap BS1 (huidige staat)

- `facturen` (956) = disposition-payment-model → representeert deze module
  NIET. Pagina's `facturen.html`, `facturen-te-beoordelen.html`,
  `factuur-detail.html`, `facturen-data.js` zijn op dat oude model gebouwd.
- Geen `invoices`/`billing_fields`-tabel; geen shift-koppeling; geen
  submit/beoordeel-workflow; geen PDF-rpc; geen periode/status/trashed-
  serverfilter 1-op-1 `/api/invoices`.

## 10. Plan (atomic PR's, methodiek STAP 0-6)

1. **Volledige scrape** (user, CORS): `bs2-console-facturen-scrape.js` →
   paginate ALLE `/api/invoices` (alle statussen, alle pagina's) + per
   factuur `GET /api/invoices/{id}` (billing_fields+workflow+system_generated)
   → `bs2-facturen-full.json`.
2. **Schema**: tabellen `invoices` + `invoice_billing_fields`
   (+`data jsonb` met volledige `bs2_scrape`, `bs2_id`). Backups.
3. **Importer** (niet-destructief): `write-facturen.mjs` (service-role REST),
   `data.bs2_scrape` 100% behoud.
4. **UI**: `facturen.html` (Alle facturen) + `facturen-te-beoordelen.html`
   (Te beoordelen) 1-op-1: status/periode/search/trashed-serverfilter +
   paginatie 15/pagina; `factuur-detail.html` met regels + berekeningen +
   workflow-historie + beoordeel-acties + **PDF side-by-side viewer**.
   BS1-huisstijl; DATA-SLIM (zware `bs2_scrape` niet in localStorage).
5. **Verificatie**: per datumbereik getallen = BS2 (lijst + per-factuur
   totalen), detail veld-voor-veld, 2 clean runs, 0 console-errors.

Status-mapping NL: draft↔Concept? — NEE: BS2 toont Engelse status-afgeleide
labels; exacte NL-labels + beoordeel-knopteksten nog te bevestigen in de
finale scrape (UI-tekst). Data/berekening/flow zijn strikt 1-op-1.
