# v3 Fase E.6 + E.11 — data-laag wiring — STATUS COMPLETE

**Status**: ✅ **100% LIVE & verified 2026-05-14**
**Bugs**: geen (PR #146 merged zonder issues)
**2 HARDCORE CLEAN RUNS PASS ZONDER fix tussendoor**

---

## E.6 Read-audit (GDPR Art. 15)

- `read-audit.js` LIVE: `window.besaReadAudit.log(resource, resource_id)`
- Throttle 5 min per (resource + id) → max 1 entry per page-refresh-burst
- Wired in `client-detail.html` + `medewerker.html` inline init-script
- Logt `bekijken`-actie in `audit_log` met `gebruiker_label = email`

## E.11 Optimistic-lock (concurrent-edit protection)

- `clienten-data.js` `update()` doet pre-check via `besaOptimisticLock.check()`
- `medewerkers-data.js` `update()` zelfde patroon
- Conflict → modal "Wijziging geblokkeerd — record is door iemand anders gewijzigd"
- 2 user-keuzes: Reload (page-refresh) of Annuleren (throw exception)

---

## 2 HARDCORE CLEAN RUNS

### CLEAN RUN #1 — client-detail.html (text-PK cliënten tabel)
- read-audit + optimistic-lock scripts loaded ✅
- Read-audit auto-logged: 1 entry in audit_log voor 'Cliënt' / 'bekijken' ✅
- Throttle: 2nd `besaReadAudit.log()` binnen 5 min → blijft 1 entry ✅
- Stale `laatstGewijzigd` injected in localStorage 'clientenItems' cache ✅
- `clientenDB.update()` → conflict-modal appeared ✅
- Modal-title: "Wijziging geblokkeerd — record is door iemand anders gewijzigd" ✅
- Modal toont recordName "TestE6 E11Run1" ✅
- Cancel click → throw "Cliënt-wijziging geannuleerd — record was inmiddels gewijzigd" ✅
- DB `voornaam` = "TestE6" → UNCHANGED ✅

### CLEAN RUN #2 ZONDER fix tussendoor — medewerker.html (uuid-PK medewerkers tabel)
- read-audit + optimistic-lock scripts loaded ✅
- Read-audit auto-logged: 1 entry voor 'Medewerker' / 'bekijken' ✅
- Stale `laatstGewijzigd` injected in localStorage 'employeeItems' cache ✅
- `medewerkersDB.update()` → conflict-modal appeared ✅
- Modal toont recordName "TestE6Med" ✅
- Cancel click → throw "Medewerker-wijziging geannuleerd — record was inmiddels gewijzigd" ✅
- DB `voornaam` = "TestE6Med" → UNCHANGED ✅
- Happy-path: na `refresh()` → fresh cache → update SUCCEEDS → DB = "TestE6Med-UPDATED" ✅

### Cleanup
- 1 test-medewerker + 2 test-cliënten + N audit-entries verwijderd uit productie ✅

---

## Eindstand E.6 + E.11

- ✅ 2 productie-features LIVE
- ✅ Werkt voor zowel text-PK (clienten) als uuid-PK (medewerkers)
- ✅ Conflict-detection beschermt tegen data-loss bij concurrent edits
- ✅ Read-audit-trail voor GDPR Art. 15 compliance
- ✅ Throttling tegen audit-spam (1 entry per 5 min per resource-id)
- ✅ Happy-path werkt na refresh van cache
- ✅ Console = 0 app-errors
- ✅ Bug-counter blijft #72 (geen nieuwe bugs)

## Volgende Fase E sub-fasen

- **E.7** Real-time channels (Supabase Realtime subscriptions)
- **E.10** Bulk-acties (checkbox-headers + bulk-dropdown + RPC)
- **E.9** PDF/print exports (jsPDF + print-CSS)
- **E.2** Niet-modal UI gaps (4 stat-cards / drag-drop org-editor / Active sessions)
