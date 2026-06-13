# Module 29 — Audit — STRUCTURE

**BS2 URL**: `https://etf.acceptance.besasuite.nl/audit`
**BS1 URL**: `https://futureflow-app.vercel.app/audit.html`
**Scrape datum**: 2026-05-14

## BS2 page

- Title: "Audit Logs | Embrace The Future"
- h1: "Audit Logs"
- Toolbar: Kolommen / Resources / Veroorzaker / Actie type
- Table: empty (15 of 0 total) — BS2 has 0 audit-log records (sandbox without history)
- Pagination: 10/15/30/40/50 + first/prev/next/last

## BS1 mirror

- Title: "Audit Logs — HR"
- h1: "Audit Logs"
- Header actions: Kolommen / Vernieuwen
- Toolbar: Zoeken / Alle resources (dropdown) / Alle veroorzakers (dropdown, dynamic) / Alle actie-types (dropdown) / Reset
- Table cols: TIJDSTIP / GEBRUIKER / RESOURCE / RESOURCE ID / ACTIE (badge) / DETAILS / STATUS (badge)
- Per row: clickable → opens audit-detail-modal
- Pagination: Rijen per pagina (15/30/50/100) + first/prev/next/last
- 504 records visible (max 500 generic + 4 legacy beschikking) — Sprint 16 cap MAX_PER_SOURCE=500

## BS1 modal

| Modal-ID | Class | Doel |
|---|---|---|
| `audit-detail-overlay` | `modal-overlay` (hidden attr) | Detail-view per audit-entry (8 fields: Tijdstip/Gebruiker/Resource/Resource ID/Actie/Status/Bron/Details + optional IP/User-agent) |

3 close-ways: X / Escape / Overlay ✅ (already implemented in `wireDetailModal()`)

## BS1 filter dropdowns

- **Resource** (10 hardcoded options): Medewerker / Cliënt / Beschikking / Factuur / Incident / Taak / Beleidsdocument / Verlofaanvraag / Team / NotificatieType
- **Veroorzaker** (dynamic populated from data): JS / sonck802@gmail.com / Systeem (3 distinct users)
- **Actie-type** (7 hardcoded options): Aanmaken / Bekijken / Bewerken / Verwijderen / Archiveren / Herstellen / Status wijziging

## BS1 actie badges (per actie kleurcode)

- `aanmaken` → groen (var(--green))
- `bekijken` → blauw (var(--blue))
- `bewerken` → geel (var(--yellow))
- `verwijderen` → rood (var(--red))
- `archiveren` → geel
- `herstellen` → groen
- `status_wijziging` → blauw

## BS1 status badges

- `succes`/`success` → groen
- `fout`/`error`/`failed` → rood
- anders → grijs

## Bug gefixt

### Bug #64 (UI) — Kolommen-kiezer hide werkt niet op TD-cellen

`renderRow()` in audit.js zette geen `data-col` attribuut op de `<td>`-cellen. Wanneer Kolommen-kiezer een kolom OFF zette, kreeg alleen de `<th>` de `col-hidden` class — de data-cellen bleven zichtbaar. Resultaat: header verdwijnt maar data niet (visual mismatch).

**Fix in audit.js renderRow()**: voeg `data-col="<id>"` toe aan elke `<td>` (tijdstip / gebruiker / resource / resource_id / actie / details / status). Daarmee picked `applyAuditColumnVisibility()` zowel TH als TD op.

## Schema

- 2 tabellen:
  - `public.audit_log` (generic) — 11 kolommen: id (uuid) / resource / resource_id / actie / gebruiker_id / gebruiker_label / details / status / ip / user_agent / aanmaakdatum
  - `public.beschikking_audit_log` (legacy) — domain-specifiek
- 3610 audit_log records + 4 beschikking_audit_log records
- Distinct resources: Beleidsdocument / Beschikking / Cliënt / Factuur / Incident / Medewerker / Verlofaanvraag (7)
- Distinct acties: aanmaken / archiveren / bewerken / herstellen / status_wijziging / verwijderen (6)
- Fetch cap: MAX_PER_SOURCE = 500 per bron → totaal max 1000 records in UI
