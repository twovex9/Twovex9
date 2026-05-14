# Module 29 — Audit — BS1 PARITY

## Feature pariteit-matrix

| Feature | BS2 | BS1 | Status |
|---|---|---|---|
| h1 "Audit Logs" | ✅ | ✅ | ✅ |
| Kolommen-kiezer | ✅ | ✅ | ✅ (na Bug #64 fix) |
| Resources dropdown filter | ✅ | ✅ 10 opties | ✅ |
| Veroorzaker dropdown filter | ✅ | ✅ dynamic 3 | ✅ |
| Actie type dropdown filter | ✅ | ✅ 7 opties | ✅ |
| Reset filters (BS1 extra) | ❌ | ✅ | BS1+ |
| Search (BS1 extra) | ❌ | ✅ | BS1+ |
| Vernieuwen-button (BS1 extra) | ❌ | ✅ | BS1+ |
| Table cols | Tijdstip/Gebruiker/Resource/Resource ID/Actie/Details/Status | 7 cols identiek | ✅ |
| Action badges (kleurcode per actie) | ❓ | ✅ | BS1+ |
| Status badges (succes/fout/grijs) | ❓ | ✅ | BS1+ |
| Detail-modal per row | ❌ (BS2 geen detail-view) | ✅ | BS1+ |
| Detail-modal 3 close-ways (X/Esc/Overlay) | n.v.t. | ✅ | ✅ |
| Pagination | ✅ 10/15/30/40/50 | ✅ 15/30/50/100 | ✅ functioneel |
| Sort DESC tijdstip | ✅ | ✅ | ✅ |
| Records-count | 0 (sandbox leeg) | 504 (max 500+4 per bron) | BS1+ data |
| Console errors | 0 | 0 | ✅ |

## BS1 superset features

1. **Reset-button** — wist alle filters in 1 klik (BS2 heeft geen reset)
2. **Search-input** — full-text op gebruiker/resource/resourceId/actie/details
3. **Vernieuwen-button** — refresh van DB-fetch
4. **Detail-modal** — 8 fields + IP/User-agent (BS2 toont geen detail-view)
5. **Action-badges + Status-badges** — kleurgecodeerd
6. **2 bronnen merged** — `audit_log` (generic) + `beschikking_audit_log` (legacy)
7. **localStorage cache** — `audit_log_v2` voor snelle eerste render

## Bug gefixt

### Bug #64 (UI) — Kolommen-kiezer hide werkt niet op TD-cellen

**Probleem**: `renderRow()` in audit.js zette geen `data-col` attribuut op `<td>`-cellen. Wanneer Kolommen-kiezer een kolom OFF zette via `applyAuditColumnVisibility()`, kreeg alleen de `<th>` de `col-hidden` class. De data-cellen bleven zichtbaar → visual mismatch (header verdwijnt maar data niet).

**Detectie**: in HARDCORE deep-test toggle "Details" OFF → `aria-checked=false` ✅, maar `details_hidden_count=1` (alleen 1 TH-cell hidden) → confirmed bug.

**Fix in audit.js renderRow()**: voeg `data-col="<id>"` toe aan elke `<td>`:
- `<td data-col="tijdstip">`
- `<td data-col="gebruiker">`
- `<td data-col="resource">`
- `<td data-col="resource_id">`
- `<td data-col="actie">`
- `<td data-col="details">`
- `<td data-col="status">`

Daarmee picked `applyAuditColumnVisibility()` zowel TH als TD op (DOM-selector `#audit-table [data-col="<id>"]` werkt nu op beide).

## Conclusie

Module 29 is **100% functionele pariteit** met BS2 + uitgebreid BS1-superset (detail-modal, badges, search, reset, refresh, 2-bron merge) na Bug #64 fix.
