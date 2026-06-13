# v3 Fase E core build — STATUS COMPLETE

**Status**: ✅ **100% LIVE & VERIFIED** 2026-05-14
**Bugs**: #70 + #71 gevonden tijdens CLEAN RUN #1, gefixt, 2 fresh CLEAN RUNS ZONDER fix tussendoor PASS

---

## Wat is LIVE op productie

### ✅ Fase E.1 — Schema-gaps (via Supabase Studio SQL)
- `profiles.must_change_password boolean` + `must_setup_2fa boolean`
- `check_optimistic_lock(table, id, client_updated_at)` RPC (post Bug #70 fix met `id::text` cast)
- `log_read_audit(resource, resource_id, user_id, user_label)` RPC
- `helpdesk_settings` tabel + RLS + 1 seed row
- `audit_log_actie_check` constraint includeert nu `'bekijken'` (Bug #71 fix)

### ✅ Fase E.11 — Optimistic-lock JS (via PR #141 + #142 wiring)
- `optimistic-lock.js` LIVE op CDN (200 OK)
- `window.ffOptimisticLock` beschikbaar op 59 HTML-pagina's (na PR #142 wiring)
- 2 methods: `check(table, id, clientUpdatedAt)` + `showConflictModal({recordName})`
- Conflict-modal × 3 close-ways: X / Escape / Overlay

### ✅ Fase E.12 — Session-timeout idle-detector (via PR #141)
- `attachIdleTimeout()` LIVE in `auth-guard.js` (Fase E.12 marker present)
- IDLE_MINUTES = 30 (per user-keuze #23 "zoals BS2")
- Activity-detect: mousemove/keydown/click/scroll/touchstart (throttled 30s)
- 1 min warning met countdown
- Auto-logout → `/login?idle=1`

### ✅ Fase E.13 — Retention-policy daily cron (via Supabase Studio SQL)
- `pg_cron` extension enabled
- `gdpr-retention-daily` job actief
- Schedule `0 2 * * *` (02:00 UTC daily)
- Command: `SELECT public.gdpr_retention_run_v1()`

---

## Bugs gefixt tijdens verificatie

### Bug #70 (Schema) — uuid-PK cast in check_optimistic_lock
- **Probleem**: WHERE id = $1 → "operator does not exist: uuid = text"
- **Fix**: WHERE id::text = $1 (werkt voor uuid én text PK)
- **Verified**: medewerkers (uuid) + clienten (text) + beschikkingen (text)

### Bug #71 (Schema) — audit_log_actie_check mist 'bekijken'
- **Probleem**: log_read_audit() insertte actie='bekijken' → check-constraint violation
- **Fix**: ALTER constraint om 'bekijken' toe te voegen
- **Verified**: 7 acties allowed (aanmaken/bekijken/bewerken/verwijderen/archiveren/herstellen/status_wijziging)

---

## 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor

### CLEAN RUN #1 (fresh, home.html)
- Scripts: optimistic-lock.js OK + loaded + 2 keys
- auth-guard.js has Fase E.12 idle-detector + IDLE_MINUTES=30
- RPC check_optimistic_lock(medewerkers, real-id, current-ts) → true
- RPC check_optimistic_lock(medewerkers, real-id, stale-ts) → false
- RPC log_read_audit → returns uuid (Bug #71 verified live)
- bekijken_count = 1 (geïnsert)
- helpdesk_settings accessible (tel + email)
- profile_flags: must_change_password=false, must_setup_2fa=false
- Console = 0 app-errors

### CLEAN RUN #2 ZONDER fix tussendoor (medewerker.html)
- Identiek RUN #1: alle scripts loaded
- RPC check_optimistic_lock(clienten, text-pk, current-ts) → true (Bug #70 verified live)
- RPC check_optimistic_lock(beschikkingen, text-pk, current-ts) → true
- RPC log_read_audit → returns uuid
- bekijken_total = 2 (1 + 1)
- Conflict-modal × Escape close → ✅
- Conflict-modal × Overlay close → ✅
- Console = 0 app-errors

### Cleanup
- 2 test-audit-records (clean-run-1-test, clean-run-2-test) verwijderd uit audit_log

---

## Eindstand Fase E core build

- ✅ 4 sub-fasen LIVE (E.1, E.11, E.12, E.13)
- ✅ 2 bugs (#70, #71) gefixt
- ✅ 2 HARDCORE CLEAN RUNS PASS ZONDER fix tussendoor
- ✅ 0 console-errors
- ✅ Bug-counter: laatste #71, volgende #72

## Volgende Fase E sub-fasen

- **E.6** Read-audit DATA-LAAG integratie (call `log_read_audit()` vanuit cliënt-/medewerker-data-lagen bij SELECT)
- **E.11** Optimistic-lock DATA-LAAG integratie (call `ffOptimisticLock.check()` vanuit update()-methods)
- **E.14** DSR-flow (anonymiseer + GDPR-export buttons)
- **E.7** Real-time Supabase channels
- **E.10** Bulk-acties UI + RPC
- **E.9** PDF/print exports
- **E.4/E.5** Data + Storage import (gepland pre-go-live per user-keuze #17)
