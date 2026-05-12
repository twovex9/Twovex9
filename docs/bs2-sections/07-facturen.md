# BS2 — Facturen (`/invoices-module/...`)

**Default URL**: https://etf.acceptance.besasuite.nl/invoices-module/invoices-to-review

## Sub-pagina's

| Tab | URL | Doel |
|---|---|---|
| **Te beoordelen** (current) | `/invoices-module/invoices-to-review?status=submitted&period[start]=YYYY-MM-DD&period[end]=YYYY-MM-DD` | Facturen wachtend op approval |
| **Alle facturen** | `/invoices-module/monthly-invoices?status=submitted&status=approved&period[start]=...&period[end]=...` | Volledige overzicht per maand |

Hint: URL query-params zijn **JSON:API-stijl** (`period[start]`, `period[end]`, multi-value `status=...&status=...`).

## /invoices-module/invoices-to-review — Te beoordelen

### Header / KPI
- Module-titel: "Facturen"
- Page-titel: "Facturen te beoordelen"
- Subtotaal: **€ 90.514,44**, **15** te beoordelen

### Toolbar
- **Kolommen** (kolomkiezer)
- **Gearchiveerd** toggle
- Filters: **Status**, **Periode**, search box

### Tabel-kolommen
| Kolom | Type / voorbeelden |
|---|---|
| Maand | "April 2026", "Maart 2026" |
| Medewerker | naam — bv. Yasemin Özkaraaslan, Hamza Essaoui, Brahim el Bacha |
| Factuurnummer | vrije text — gemengd formaat (vb. "20262", "2026050012", "2026-0005", "04-26", "003") — ZZP'ers verzinnen eigen nummers |
| Status | enum (Ingediend / Goedgekeurd / Afgekeurd) |
| Aanmaakdatum | dd-mm-yyyy |
| Bedrag | € numeric — range €1.016 tot €9.630 in deze sample |

### Voorbeelden (top 15 te beoordelen)
- Yasemin Özkaraaslan: April + Maart 2026 (€9.280 + €8.760)
- Brahim el Bacha: April + Maart 2026 (€8.707,50 + €9.630)
- Hamza Essaoui: April (€5.628)
- Samra Akaazoun, Yassir Aznag, Allal Butrah, Feyza Ozdemir, Nurseli Yuruk, Yassine Azarfane, Sofyan Amenchar, Amine Belyandouz, Aimane Akkabi, Solaiman Zattouti

## Inferred datamodel — `facturen`

BS1 heeft al `public.facturen` (956 rows!). Schema is grotendeels op orde. Velden uit BS2 UI:

```sql
-- Vermoedelijk al in BS1:
create table if not exists public.facturen (
  id text primary key,
  medewerker_id uuid references public.medewerkers(id),
  factuurnummer text not null,             -- vrije text, ZZP'ers verzinnen eigen
  periode_jaar int not null,
  periode_maand int not null,
  bedrag numeric not null,
  status text check (status in ('concept','ingediend','goedgekeurd','afgekeurd')),
  aanmaak_datum date not null,
  ingediend_op timestamptz,
  archived boolean default false
);
```

## Parity met BS1

- ✅ Tabel `public.facturen` bestaat (**956 rows productie-data!**)
- ✅ HTML/JS-files: `facturen.html`, `facturen.js`, `facturen-data.js`, `facturen-bulk.js`, `facturen-importeren.html/.js`, `facturen-te-beoordelen.html/.js`
- ✅ Sub-pages "Te beoordelen" / "Alle facturen" mapt op bestaande BS1-pagina's
- 🟡 Workflow voor "Aanmaken eigen factuur" door ZZP'er — onbekend of BS1 dit heeft als zelf-service flow
- 🟡 PDF generatie — uit nieuws-bericht: "PDF downloaden", "PDF herladen" → BS2 genereert PDF server-side. BS1 mogelijk niet.
- ❓ "Bedrijfsgegevens + logo per ZZP'er" — profiel-velden onbekend in BS1

## API endpoints (te bevestigen)

Vermoedelijk: `GET /api/invoices?status=submitted&page=N&limit=15&period[start]=...&period[end]=...`
