# BS2 — Kilometers (`/mileage/declarations`)

**URL**: https://etf.acceptance.besasuite.nl/mileage/declarations
**URL-naamgevingsconventie**: `/mileage/<english-slug>?month=N&year=YYYY`

## Page structuur

### Header / KPI cards
| KPI | Waarde |
|---|---|
| Totale declaraties (count) | 16 |
| Totale afstand | 5.004,54 km |
| Totaalbedrag | € 1.717,71 |

(Subtitles: "Declaraties deze periode", "Totale vergoeding")

### Toolbar
- **Kolommen** (kolomkiezer)
- Filters: **Maand**, **Jaar**, **Medewerker**
- Search: niet zichtbaar bij eerste capture maar verwacht

### Tabel-kolommen
| Kolom | Type / format |
|---|---|
| Medewerker | naam (kan `-` zijn = anoniem of niet-medewerker entry) |
| Periode | bv. "May 2026", "April 2026" |
| Status | enum: `Niet ingediend` / `Ingediend` |
| Ingediend op | datum dd-m-yyyy, of `-` als nog niet ingediend |
| Totale kilometers | numeric (kan 0, 11, 168, 1209.64 etc.) |
| Totale vergoeding | € numeric (€ 0,00 t/m € 471,76 in deze sample) |

### Data-voorbeelden
- Top declarant: **Valerie Koster** — April 2026 (1209.64 km, € 471,76 ingediend) + March 2026 + February 2026 (3× ingediend, €1.302 totaal)
- Vergoeding per km lijkt **€ 0,39/km** (1209.64 × 0,39 ≈ 471,76) — standaard fiscaal NL tarief
- Sommige rijen `Medewerker: -` → mogelijk legacy entries zonder koppeling

### Maand-filtering
- URL kan met query: `/mileage/declarations?month=4&year=2026`

## Inferred datamodel — `kilometer_declaraties`

```sql
create table if not exists public.kilometer_declaraties (
  id text primary key,
  medewerker_id uuid references public.medewerkers(id),  -- nullable voor legacy
  periode_jaar int not null,
  periode_maand int not null,
  totale_kilometers numeric not null default 0,
  totale_vergoeding numeric not null default 0,
  status text check (status in ('niet_ingediend','ingediend','goedgekeurd','afgekeurd')) default 'niet_ingediend',
  ingediend_op timestamptz,
  archived boolean default false
);
```

**BS1 status** (uit `list_tables`):
- ✅ `public.kilometer_declaraties` (0 rows) — schema bestaat
- ✅ `kilometers.html` + `kilometers.js` + `kilometer-declaraties-data.js` aanwezig
- Commit-historie: "Kilometers: nieuwe pagina + Supabase tabel + add-modals (handmatig/ka...)"

## Parity met BS1

- ✅ Pagina + tabel + data-laag bestaan al
- 🟡 Sub-units (per maand per medewerker) — moet geverifieerd in BS1
- 🟡 Status-flow (niet_ingediend → ingediend → goedgekeurd?) — onbekend in BS1
- ❓ €0,39/km tarief — staat hardcoded in BS1 of komt uit config-tabel?

## API endpoints (nog niet vastgelegd)

Bij navigate werden alleen `OPTIONS /api/broadcasting/auth` calls gezien (websocket auth, niet data). Echte data-call moet opnieuw getriggerd worden via filter-wijziging om endpoint te zien.

Vermoedelijk: `GET /api/mileage/declarations?page=N&limit=N&filter[month]=N&filter[year]=N`
