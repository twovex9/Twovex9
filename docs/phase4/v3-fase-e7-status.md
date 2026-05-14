# v3 Fase E.7 — Real-time Supabase channels — STATUS COMPLETE

**Status**: ✅ **100% LIVE & verified 2026-05-15**
**Bugs gefixt**: Bug #73 (subscribe retry voor non-defer scripts)
**2 HARDCORE CLEAN RUNS PASS ZONDER fix tussendoor (post Bug #73 fix)**

---

## Architecture

`realtime-sync.js` levert `window.besaRealtime`:
- `subscribe(tableName, onChangeCallback)` → opens Supabase Realtime channel
- Debounced 1.5s — multiple rapid changes binnen window → 1 callback
- Auto-cleanup on `beforeunload`
- Tracks active subscriptions

Data-lagen (clienten + medewerkers) subscriben in hun bootstrap. Bij postgres_changes events op de bijbehorende tabel → debounced refresh + `besa:<naam>-updated` event → UI re-render.

## SQL (LIVE in productie)

11 tabellen in `supabase_realtime` publication:
- clienten / medewerkers / beschikkingen / facturen / incidenten
- planning / taken / beleidsdocumenten / teams
- notification_types / notifications

## Bug #73 — Subscribe retry voor non-defer scripts

**Detectie via RUN #2**: `index.html` (medewerkers-data.js zonder `defer`) had `getActiveSubscriptions()` → `[]`. medewerkers-data.js bootstrap fired BEFORE realtime-sync.js (mét defer) had geladen → `if (besaRealtime)` check false → silent skip.

**Fix**: `trySubscribeRealtime(attempt)` retry-pattern in beide data-lagen:
- Max 10 retries × 300ms = 3s wachten op besaRealtime
- Idempotent via `realtimeSubscribed` boolean
- Fail-graceful (geen exceptions)

---

## 2 HARDCORE CLEAN RUNS (post Bug #73 fix)

### CLEAN RUN #1 — clienten.html (text-PK, mét defer)
- subscriptions: `['clienten']` direct na page-load ✅
- Cache: 160 cliënten ✅
- SQL INSERT 'RtRun1' → cache 161, testRecord visible ✅
- voornaam=RtRun1, achternaam=Insert in cache ✅
- Auto-sync binnen ~4s ✅

### CLEAN RUN #2 ZONDER fix tussendoor — index.html (uuid-PK, geen defer)
- **Bug #73 fix verified**: subscriptions = `['medewerkers']` na retry-pattern ✅
- Cache: 103 medewerkers ✅
- SQL INSERT 'RtMedTest Run2' → cache 104 ✅
- testRecord visible: "RtMedTest Run2" ✅
- Auto-sync binnen ~4.5s ✅

### Cleanup
- 1 test-cliënt (ZZZ-CLAUDE-TEST-RT2) deleted
- 1 test-medewerker (RtMedTest) deleted

---

## Eindstand E.7

- ✅ Real-time multi-user sync LIVE op 11 tabellen
- ✅ `besaRealtime.subscribe()` werkt met text-PK én uuid-PK
- ✅ Debounce 1.5s tegen UI-thrashing
- ✅ Auto-cleanup on beforeunload
- ✅ Bug #73 fix robust voor non-defer script-load scenarios
- ✅ 2 HARDCORE CLEAN RUNS PASS ZONDER fix tussendoor
- ✅ Console = 0 app-errors
- ✅ Bug-counter: laatste #73, volgende #74

## Volgende Fase E sub-fasen

- **E.10** Bulk-acties (checkbox-headers + bulk-dropdown + RPC)
- **E.9** PDF/print exports (jsPDF + print-CSS)
- **E.2** UI gaps (4 stat-cards, drag-drop org-editor, Active sessions)
