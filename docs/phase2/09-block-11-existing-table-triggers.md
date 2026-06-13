# Phase 2 — Block 11: Audit triggers op bestaande tabellen

**Datum**: 2026-05-12
**Commit**: `1579a06`
**Status**: ✅ Live geverifieerd

## Doel
Phase 2 Block 10 voegde audit-triggers toe aan de 5 nieuwe tabellen. Block 11 breidt dit uit naar de **bestaande productie-tabellen** zodat de audit-page volledige CRUD-history dekt over de hele applicatie.

## Tabellen met nieuwe triggers

| Tabel | Productie-data | Bijzonderheid |
|---|---|---|
| `public.medewerkers` | 98 rows | Standaard `archived` kolom |
| `public.clienten` | 80 rows | Standaard `archived`, clientnummer als fallback label |
| `public.beschikkingen` | 100 rows | ⚠️ Gebruikt `gearchiveerd` (NL) i.p.v. `archived`. Status_wijziging op `fase` kolom. |
| `public.facturen` | 956 rows | ⚠️ Ook `gearchiveerd`. Status_wijziging op `status` kolom. Label bevat factuurnummer + €bedrag. |
| `public.incidenten` | 0 rows | Standaard `archived`, status_wijziging op `status` kolom (in_afwachting / in_behandeling / opgelost). |

## Slimme detecties per trigger

1. **archive/restore**: vergelijkt `OLD.archived` (of `gearchiveerd`) tegen `NEW`
2. **status_wijziging**: voor tabellen met workflow-status (beschikkingen.fase, facturen.status, incidenten.status), logt de transitie expliciet inclusief `OLD → NEW` waarde in `details`
3. **Label-strategie**: probeert volledige naam, valt terug op email/clientnummer/factuurnummer/id

## End-to-end verificatie

```sql
UPDATE public.medewerkers SET laatst_gewijzigd = now() WHERE id = ... ;
UPDATE public.facturen SET laatst_gewijzigd = now() WHERE id = ... ;
```

Direct daarna in `audit_log`:
- `Medewerker | <uuid> | bewerken | "Abdelmajid Bentla"`
- `Factuur | f_0001 | bewerken | "Factuur 20260026"`

Live zichtbaar op `futureflow-app.vercel.app/audit.html`.

## audit.html — Filter uitbreiding

Resource-dropdown nu **10 opties** (alles wat audit-coverage heeft):
- Medewerker, Cliënt, Beschikking, Factuur, Incident (Block 11)
- Taak, Beleidsdocument, Verlofaanvraag, Team, NotificatieType (Block 10)

## Risico & mitigatie

| Risico | Mitigatie |
|---|---|
| Trigger op productie-tabel met 956 rows kan vertraging veroorzaken | AFTER-trigger met enkele INSERT in audit_log — overhead is microseconden per row |
| Trigger-bug zou parent-transactie kunnen blokkeren | `log_audit_event()` heeft `EXCEPTION WHEN OTHERS` — audit-fout faalt nooit de DML |
| Audit_log groeit snel bij veel mutaties | Geen retention-beleid yet. Toekomstige overweging: maandelijks archiveren van entries >1 jaar oud |
| `auth.uid()` werkt niet in service-context (SQL via MCP) | `gebruiker_label` valt terug op "Systeem", `gebruiker_id` blijft NULL — semantisch correct |

## Cumulatief — Audit-coverage na Block 11

| Bron | Tabel | Trigger | Logt op |
|---|---|---|---|
| Legacy | `beschikking_audit_log` | (handmatige inserts uit code) | Beschikking views/edits |
| Block 10 | `taken` | trg_audit_taken | aanmaken/bewerken/verwijderen/archiveren/herstellen/status_wijziging |
| Block 10 | `beleidsdocumenten` | trg_audit_beleidsdocumenten | idem (zonder status_wijziging) |
| Block 10 | `verlof_aanvragen` | trg_audit_verlof | idem + status_wijziging (concept→ingediend→goedgekeurd/afgewezen) |
| Block 10 | `teams` | trg_audit_teams | idem |
| Block 10 | `notification_types` | trg_audit_notification_types | idem |
| Block 11 | `medewerkers` | trg_audit_medewerkers | idem |
| Block 11 | `clienten` | trg_audit_clienten | idem |
| Block 11 | `beschikkingen` | trg_audit_beschikkingen | idem + status_wijziging op fase |
| Block 11 | `facturen` | trg_audit_facturen | idem + status_wijziging op status |
| Block 11 | `incidenten` | trg_audit_incidenten | idem + status_wijziging op status |

**11 tabellen volledig gedekt.** Resterende tabellen (gemeenten, locaties, bureaus, opleidingen, competenties, organisaties, zorgsoorten, planning, werkuren, kilometer_declaraties, etc.) zonder audit-trigger — voornamelijk master-data zonder workflow.

## Sessie-totaal Phase 2 na Block 11

- **19 commits** op `main`
- **6 nieuwe BS1 modules** (Beleidsdocumenten, Taken, Teams, Audit, Verlof, Instellingen)
- **7 nieuwe Supabase tabellen** (beleidsdocumenten, taken, teams, medewerker_teams, verlof_aanvragen, notification_types, audit_log)
- **1 storage bucket** (beleidsdocumenten)
- **11 trigger-functies** (10 nieuwe + 1 helper-function `log_audit_event`)
- **Volledige audit-coverage** over alle belangrijke business-tabellen
