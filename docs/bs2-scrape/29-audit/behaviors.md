# Module 29 — Audit — BEHAVIORS

## Row-click → detail-modal
- Klik op rij OF Enter/Space op gefocused row → `openDetailModal(auditId)`
- Opens `audit-detail-overlay` met 8 fields:
  - Tijdstip (DD-MM-YYYY HH:MM:SS + raw ISO in muted span)
  - Gebruiker
  - Resource
  - Resource ID (monospace, font-size 12px)
  - Actie (badge per actie-type)
  - Status (badge: succes=groen, fout=rood, anders=grijs)
  - Bron (generic / beschikking-legacy)
  - Details (JSON pretty-print indien parseable, anders raw pre)
- Optional: IP-adres + User-agent (monospace, alleen indien aanwezig)
- Body-scroll lock tijdens modal open

## Filters

### Resource filter
- Hardcoded dropdown met 10 opties (10 BS2 resource-types)
- `state.filterResource` → filtert `a.resourceType === value`

### Veroorzaker filter (dynamic)
- `populateVeroorzakerFilter()` extraheert unieke `a.gebruiker` waarden uit data
- Sorteert alfabetisch nl-locale
- Re-populated bij `besa:audit-updated` event

### Actie-type filter
- Hardcoded dropdown met 7 opties (matchend met actie-badge colors)
- Filtert op `a.actieType === value`

### Search
- Doorzoekt `gebruiker + resourceType + resourceId + actieType + details`
- Live filter on input, page reset to 1

### Reset
- Wist search + alle 3 dropdowns + page → 1
- Toont info-feedback "Filters gewist"

## Vernieuwen-button
- Klik → `auditDB.refresh()` → re-fetch beide bronnen
- Update visible items + Veroorzaker dropdown
- Stille catch op error (logged in console)

## Kolommen-kiezer
- 6 toggles (Tijdstip/Gebruiker/Resource/Resource ID/Details/Status — Actie is skipToggle)
- Persistent voorkeuren in `localStorage["audit_columns_v1"]`
- **Na Bug #64 fix**: zowel `<th>` als `<td>` cellen hebben `data-col` attribuut → toggle hide werkt op beide

## Pagination
- 504 records / 30 per page = 17 pages (default)
- First/Prev/Next/Last buttons + range-label + page-label
- RPP dropdown: 15/30/50/100
- Last page heeft 24 records (504 - 16*30)

## Sort
- Default DESC op `tijdstip` (nieuwste eerst)
- Server-side ORDER BY in fetchBesch() en fetchGeneric()
- Client-side mergeSorted() na merge van 2 bronnen

## Cache
- localStorage key `audit_log_v2` met genormaliseerde merged items
- First render → cache-only (snel)
- Background refresh → DB-call (max 500 per bron)
- Event `besa:audit-updated` → re-render trigger

## Action-badge colors (uit actieBadge function)
| Actie | Color | Background |
|---|---|---|
| aanmaken | green | green-soft |
| bekijken | blue | blue-soft |
| bewerken | yellow | yellow-soft |
| verwijderen | red | red-soft |
| archiveren | yellow | yellow-soft |
| herstellen | green | green-soft |
| status_wijziging | blue | blue-soft |
| else | text-muted | line |

## Modal close-ways (3/3 ✅, geen bug)
- X-button (`audit-detail-close`)
- Escape keydown (when `overlay.hidden === false`)
- Overlay-click (e.target === overlay)
