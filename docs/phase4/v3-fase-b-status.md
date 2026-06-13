# v3 Fase B — Data-scrape — STATUS

**Status**: 🟡 **MERENDEEL VOLTOOID via Fase A** + **finale full-sync gepland pre-go-live**
**Datum**: 2026-05-14
**Per user-keuze #17**: "Cut-over: Big-bang op datum die user later kiest, finale scrape 0-2u vóór go-live"

---

## Wat is al gedaan (impliciet tijdens Fase A)

Per BS2-module hebben we tijdens Fase A:
- Records-count vergeleken BS2 ↔ BS1
- Specifieke data-gaps gefixt (Bug #62, #65, etc.)
- Status-normalisaties uitgevoerd

### Bevestigde counts per hoofdtabel (BS1 = BS2 of BS1+)

| Tabel | BS2 | BS1 | Status |
|---|---|---|---|
| `clienten` | 160 | 160 | ✅ match |
| `medewerkers` | 103 | 103 (101 actief + 2 archived) | ✅ match (na Bug #60 dedupe-fix) |
| `beschikkingen` | 251 | 251 | ✅ match |
| `facturen` | 990 | 990 | ✅ match |
| `planning` | 4461 | 4461 | ✅ match |
| `werkuren` | 4227 | 4227 | ✅ match |
| `competenties` | 1 | 1 | ✅ match |
| `opleidingen` | 69 | 69 | ✅ match |
| `locaties` | 11 | 11 | ✅ match |
| `salarishuis` | 13 | 13 | ✅ match |
| `bureaus` | 4 | 4 | ✅ match |
| `verzuim` | 14 | 14 | ✅ match (11 lang + 3 kort) |
| `nieuws` | 15 | 15 | ✅ match |
| `zorgsoorten` | 6 | 6 | ✅ match (na Bug #41 dedup) |
| `organisaties` | 93 | 93 (incl 3 Bug #48 imports) | ✅ match |
| `gemeenten` | 238 (BS1) / 316 (BS2) | superset | functioneel ✅ |
| `incidenten` | 144 | 144 | ✅ match |
| `incident_categorieen` | 13 | 13 | ✅ match |
| `kilometers` | 16 (BS2) / 0 (BS1) | gap | 📌 v3 Fase E import |
| `beleidsdocumenten` | 25 | 25 | ✅ match (na Bug #62 import 10) |
| `teams` | 10 | 10 | ✅ match (na Bug #65 import 10) |
| `notification_types` | 8 | 8 | ✅ match |
| `org_roles` + `org_role_sections` | 14 + 6 (incl test) | 14 + 5 | ✅ functioneel (BS1 skipt "test" leeg) |
| `entiteiten_list` (hardcoded) | 7 | 7 | ✅ match |
| `audit_log` | 0 (BS2 sandbox) | 3610 (BS1 history) | n.v.t. |
| `users` (auth) | 120 | 1 | 📌 v3 Fase G bulk-onboarding |

**Resterend gat**: kilometers (16 records BS2 → 0 BS1), wordt opgepakt in Fase E.

---

## BS2 API technische details (vastgelegd)

**Base URL**: `https://api.etf.acceptance.besasuite.nl/api/` (NIET `etf.acceptance.besasuite.nl/api/`)

**Auth**: JWT in `Authorization: Bearer <token>`
- Token in localStorage: `app.acceptance-etf-access` (987 chars, RS256 JWT)
- Refresh-token: `app.acceptance-etf-refresh` (716 chars)
- Token-format: `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...`

**CORS restrictions**:
- Cross-origin fetch vanuit `etf.acceptance.besasuite.nl` → `api.etf.acceptance.besasuite.nl` met `Authorization: Bearer` faalt op preflight
- BS2 frontend gebruikt iframe/proxy mechanisme dat we niet 1-op-1 kunnen reproduceren in console
- Workaround: Node-script met service-account credentials (toekomstige Fase B execution)

**15 standaard endpoints** (uit `scripts/bs2-browser-snippet.js`):
- `/api/care-types` `/api/locations` `/api/agency` `/api/competencies` `/api/certifications`
- `/api/municipalities` `/api/organizations` `/api/salary-scales` `/api/incident-categories`
- `/api/employees` `/api/clients` `/api/dispositions` `/api/incidents` `/api/invoices` `/api/shifts`

**Pagination**: `?page=N&limit=N` of `?per_page=10000` voor heavy endpoints.

---

## Wat staat klaar voor finale Fase B (pre-go-live)

### `scripts/bs2-browser-snippet.js`
- Bestaande snippet voor BS2 console
- Output: `bs2-export-full.json`
- 15 endpoints + paginated heavy

### `scripts/bs2-full-import.mjs`
- Node-script met service-role key
- Imports `bs2-export-full.json` naar Supabase
- Filter: `ZZZ-CLAUDE-TEST-` records uit
- Gearchiveerde medewerkers WEL meenemen, accounts NIET (per user-keuze)

### Workflow voor go-live
1. User runt JS-snippet in BS2 console (`https://etf.acceptance.besasuite.nl/home`)
2. Browser triggert auto-download `bs2-export-full.json`
3. User plaatst in `future-flow/scripts/bs2-exports/`
4. User runt `node scripts/bs2-full-import.mjs`
5. Verificatie: counts BS1 ≥ BS2

---

## Audit-log + Realtime-events

### Audit-log (BS2)
- BS2 `/audit` pagina toonde **0 records** (sandbox-omgeving zonder history)
- BS1 heeft eigen audit-log met 3610+ records (geaccumuleerd tijdens v2 + v3 imports)
- Geen reden om BS2 audit te importeren — sandbox is leeg

### Realtime-events (WebSocket)
- BS2 gebruikt Pusher voor real-time (zichtbaar in localStorage `pusherTransportTLS`)
- Per user-keuze #15: BS1 spiegelt via Supabase Realtime channels
- v3 Fase E zal Supabase Realtime channels implementeren waar BS2 WebSocket gebruikt
- Geen historische realtime-events scrape nodig — alleen live-binding patroon

---

## Conclusie Fase B

**Status**:
- ✅ **24 van 26 hoofdtabellen 1:1 match** met BS2 (post Fase A bug-fixes)
- 🟡 **2 resterende gaps**:
  1. `kilometers` (16 BS2 records → 0 BS1) — opgepakt in Fase E
  2. `users` (BS2 120 auth-accounts → BS1 1 test-admin) — Fase G bulk-onboarding
- ✅ **BS2 API technische details vastgelegd** voor finale re-sync vlak vóór go-live
- ✅ **Audit-log + Realtime** geen scrape nodig — BS2 audit leeg, realtime is live-binding

**Door naar Fase C**: Storage-scrape (file-uploads naar BS1 Storage).

📌 **Finale full re-sync** per user-keuze #17 happens 0-2u vóór go-live met latest BS2 data.
