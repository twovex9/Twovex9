# BS2 — Urenregistratie (`/time-registration/time/summary`)

**URL**: https://etf.acceptance.besasuite.nl/time-registration/time/summary
**Page title**: Urenregistratie | Embrace The Future

## API endpoint ontdekt

**Subdomain**: `api.etf.acceptance.besasuite.nl`

```
GET /api/time/summary?filter[start_date]=2026-05-01&filter[end_date]=2026-05-31
```

- JSON:API-stijl filter-syntax: `filter[start_date]`, `filter[end_date]`
- CORS-preflight (OPTIONS, 204) gezien → frontend en API zijn cross-origin
- **Implicatie**: BS2 frontend (Vue) communiceert met REST API op aparte subdomain. Geen GraphQL of WebSocket gezien.

## Page-structuur

### Header
- Titel: "Geregistreerde uren"
- Action buttons: **Exporteren**, **Mei vergrendelen** (maand-lock feature)

### Linker zijbalk — datum + filters

**Calendar widget** "May 2026" — toont volledig maand-grid (S/M/T/W/T/F/S header), individuele dag-buttons klikbaar (1 mei t/m 6 juni zichtbaar). Voor en achter de maand "leading/trailing" dagen.

**Filters**:
- **Urentype** — tabs: Alle | WLZ/Ambulant | Planning
- **Filter op gebruiker** — dropdown "Selecteer Gebruiker"
- **Filter op cliënt** — dropdown "Selecteer Cliënt"
- **Filter op label** — dropdown "Selecteer Label"
- Action: **Filters wissen**

### Hoofdcontent — uren-tabel per medewerker

**Periode-header**: "1 mei - 31 mei" (actieve range)

**Tabel-kolommen**:
| Kolom | Toelichting |
|---|---|
| Datum | dag van entry |
| Tijd | start-tijd of tijdsbereik |
| Duur | uren-decimal |
| Cliënt | gekoppelde cliënt |
| Dienst | dienst/shift naam |
| Label | uren-label (uit `werkuren_labels`) |
| Beschrijving | vrije tekst |
| Acties | edit/delete |

**Per medewerker een rij-groep**: avatar-initialen + naam + `(aantal entries)` + "Bekijken in agenda" link

**Voorbeelden van medewerkers** (geanonimiseerd voor inventaris):
- YM (Yavuz M.) — 1 entry
- YÖ (Yasemin Ö.) — 1 entry
- NB (Naomi B.) — 14 entries (top)
- KO (Khalid O.) — 4 entries
- AFB (Ahmed Faridi B.) — 1 entry
- HB (Hulya B.) — 1 entry
- LB (Leonie B.) — 1 entry
- MA (Mouad A.) — 2 entries
- SA (Sofyan A.) — 1 entry
- NEK (Naima El K.) — 2 entries
- AB (Abdelmajid B.) — 1 entry
- OP (Orpheo P.) — 4 entries
- MEH (Mohammed el H.) — 1 entry
- MS (Mustapha S.) — 1 entry
- AA (Aimane A.) — 1 entry
- TM (Test Medewerker) — 1 entry

### Footer (totalen)

- **Totaal uren**: 206.01
- **Totaal medewerkers**: 16
- **Aantal entries**: 37

## Inferred datamodel — `werkuren` + `werkuren_vergrendeld` + `werkuren_labels`

```sql
-- Uren-entry
create table if not exists public.werkuren (
  id text primary key,
  medewerker_id uuid references public.medewerkers(id),
  client_id text references public.clienten(id),
  dienst_id uuid references public.diensten(id),  -- of public.planning(id)
  label_id uuid references public.werkuren_labels(id),
  datum date not null,
  start_tijd time,
  eind_tijd time,
  duur_uren numeric not null,
  urentype text check (urentype in ('wlz_ambulant','planning')),  -- of vrije text
  beschrijving text,
  archived boolean default false,
  created_at timestamptz default now()
);

-- Maand-locks
create table if not exists public.werkuren_vergrendeld (
  id text primary key,
  jaar int not null,
  maand int not null,
  vergrendeld_op timestamptz default now(),
  vergrendeld_door uuid references public.profiles(id),
  unique (jaar, maand)
);

-- Labels
create table if not exists public.werkuren_labels (
  id uuid primary key default gen_random_uuid(),
  naam text not null unique,
  archived boolean default false
);
```

## Vergelijking met BS1

| Aspect | BS2 | BS1 status |
|---|---|---|
| Page bestaat | ✅ | ✅ `werkuren.html` + `werkuren.js` + `werkuren-data.js` |
| `werkuren` tabel | ✅ | ✅ `public.werkuren` (0 rijen) |
| Maand-vergrendeling | ✅ "Mei vergrendelen" | ✅ `public.werkuren_vergrendeld` (0 rijen) |
| Labels | ✅ `werkuren_labels` filter | ✅ `public.werkuren_labels` (6 rijen) |
| Urentype tabs (Alle/WLZ/Planning) | ✅ | ❓ Onbekend |
| Cliënt/Dienst koppeling per entry | ✅ | ❓ Te verifiëren |
| Calendar widget month-view | ✅ | ❓ Onbekend |
| Multi-medewerker groepering | ✅ | ❓ Onbekend |
| Totalen-footer (uren/medewerkers/entries) | ✅ | ❓ Onbekend |

## Status / parity

- ✅ Schema- en pagina-fundamenten bestaan in BS1
- 🟡 Visuele structuur (calendar widget, grouping per medewerker) moet geverifieerd in BS1
- ❌ Maand-lock workflow — onbekend of BS1 dit heeft
- ❌ "Bekijken in agenda" link per medewerker — onbekend

## Volgende stappen (Phase 2 voor deze sectie)

- API endpoint dieper testen: query `/api/time/summary` direct in DevTools om response-payload te zien (= veld-namen + types)
- "Bekijken in agenda" link volgen om agenda-view te zien
- Test-entry aanmaken om create-form velden te zien
- Maand-vergrendelen testen om lock-flow te zien
