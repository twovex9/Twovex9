# Item 62 — v3 errors.html admin-pagina (deferred naar Fase E)

**Status**: ⏳ TODO (deferred)
**Aangemaakt**: 2026-05-13 (Fase 0.5 v3)
**Geplande fase**: Fase E gap-fix bij admin-tier UI features

## Context

In Fase 0.5 (eigen monitoring zonder Sentry) is het volgende gebouwd:

- ✅ Migration `v3_phase_0_5_client_errors_and_admin_tier_helper`:
  - Tabel `public.client_errors` (id, ts, user_id, url, message, stack, user_agent, severity, handled)
  - Helper `public.is_admin_tier()` voor eigenaar/admin/directeur
  - RLS: insert door élke authenticated, select/update/delete alleen admin-tier
- ✅ Script `future-flow/error-reporter.js`:
  - `window.onerror` + `unhandledrejection` → `client_errors` insert
  - Throttle 5s per error-message
  - Buffer + flush bij sessie-beschikbaar
  - Publieke API: `ffReportError`, `ffReportWarning`
- ✅ Ingeladen op alle 49 HTML pages (na `supabase-client.js`)

**Wat nog ontbreekt** (deze open-item):

Admin-tier UI om de `client_errors` te bekijken + beheren.

## Ontwerp

Nieuwe pagina `future-flow/errors.html`:

- Standaard BS1 shell (topbar + sidebar) zoals `audit.html`
- Sidebar-link onder "Configuratie" of "Beheer" sectie
- Alleen zichtbaar voor admin-tier (`ffCan('manage_errors')` of `is_admin_tier()` check)
- Tabel met kolommen:
  - Timestamp
  - User (voornaam + achternaam uit `profiles` join)
  - URL
  - Severity (chip: error rood, warning geel, info blauw)
  - Message (truncated + tooltip met full message)
  - Stack (truncated, klik → modal met volledige stack)
  - Handled (checkbox, klik → UPDATE handled=true)
- Filters: severity, handled (toon alleen onafgehandelde), datum-range
- Sortering op timestamp desc default
- Pagination (zelfde patroon als andere lijsten)
- Bulk-actie: "Markeer alle als handled" (admin-tier only)

## Data-laag

Nieuwe `future-flow/client-errors-data.js`:

```js
window.clientErrorsDB = {
  get ready() { ... },
  refresh, fetchAll,
  list({ severity, handled, from, to, limit, offset }),
  markHandled(ids),
  remove(id),
  getAllSync, getByIdSync,
};
```

## Vereisten

- `profiles.rol` moet de 13 BS2-rollen kennen (Fase G.1) zodat `is_admin_tier()` werkt voor eigenaar/admin/directeur
- Voor MVP (vóór Fase G.1): `is_admin_tier()` werkt al met huidige `admin` rol uit 3-rollen-enum

## Effort

~2-3u in Fase E.

## Hoe te triggeren

In Fase E gap-fix sectie: zodra admin-tier UI features worden gebouwd (rond Fase E.5 / G.4), `errors.html` meenemen.

## Niet kritisch voor Fase 0

Errors worden gewoon gelogd in `client_errors`. Admin kan ze nu al bekijken via Supabase Studio (SQL Editor) of via Supabase dashboard → Table Editor → `client_errors`. UI is comfort, niet vereist voor monitoring zelf.
