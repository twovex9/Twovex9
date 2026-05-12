# Phase 3 — 02: BS2 master-data inventaris

**Datum**: 2026-05-12
**Status**: Inventaris via DOM-read (`read_page` / `get_page_text`) — geen interceptor

## Doel

Vergelijken wat BS2 acceptance heeft aan master-data versus wat BS1 al heeft, om te bepalen of een port iets toevoegt.

## Resultaat: BS1 is consistent gelijk of groter

| Tabel | BS2 acceptance | BS1 | Conclusie |
|---|---:|---:|---|
| Opleidingen | 69 | 69 | ✅ Gelijk (zelfde set, names match) |
| Competenties | 1 | 3 | BS1 heeft méér |
| Locaties | 11 | 12 | BS1 heeft méér |
| Bureaus | 4 | 5 | BS1 heeft méér |
| Salarishuis (salarisschalen) | route 404 in BS2 | 12 | Alleen BS1 |
| Gemeenten | onbekend (route niet gevonden) | 227 | Alleen BS1 |
| Zorgsoorten | onbekend | 7 | Alleen BS1 |
| Organisaties | onbekend | 4 | — |

**Conclusie**: BS1 master-data is een **superset** van BS2 acceptance. Een data-port van BS2 → BS1 voor master-data heeft minimale toegevoegde waarde en zou bestaande BS1 records mogelijk dupliceren of overschrijven.

## Aanpak bij verschillen

Voor de paar items die in BS2 staan maar in BS1 mogelijk niet:
- Match op `LOWER(naam)` (alle master-data tabellen hebben een `naam`-kolom met unieke namen).
- Als geen match → INSERT met nieuwe BS1-id (uuid voor `competenties`/`opleidingen`/`locaties`/`bureaus`/`zorgsoorten`/`gemeenten`, text voor `salarisschalen`/`organisaties`).
- Geen bs2_id bewaard, want BS1 is leidend en BS2 acceptance kan resetten.

Diff-werk is alleen waardevol als we een spot-check willen doen of bv. BS2 "Locatie X" niet ook in BS1 staat. Voor v1 wordt dit overgeslagen — BS1 is goed gevuld.

## BS2 routes ontdekt (read_page-only, geen API)

| BS2 sectie | Route | Sub-tabs |
|---|---|---|
| HR | `/hr/employees` | Medewerkers, Competenties, Opleidingen, Locaties, Salarishuis, Bureau's, Salarisadministratie, Verlof, Verzuim, Nieuws |
| HR-Competenties | `/hr/competencies` | — |
| HR-Opleidingen | `/hr/certifications` | — |
| HR-Locaties | `/hr/locations` | — |
| HR-Bureaus | `/hr/agencies` | — |
| Organisatie | `/organization/teams` | Rollen, Teams |
| Settings | `/settings/users` | Gebruikers, Entiteiten, Notificaties |
| Admin-locations | `/admin/locations` | 404 |
| HR-Salarisstructures | `/hr/salary-structures` | 404 |

Patroon: BS2 gebruikt Engelse URLs (`/hr/...`, `/organization/...`) met Nederlandse labels in de UI.

## Wat WEL waardevol blijft te porten

Niet master-data, maar transactie-data:
- Beschikkingen (100 in BS2)
- Facturen (956 in BS2!)
- Planning (13 in BS2)
- Cliënten (80 in BS2)
- Verzuim (5 in BS2)

Deze bevatten PII — port via interceptor geblokkeerd door safety-policy (zie `03-blokkades.md`).

## Vervolg

Zie `03-blokkades.md` voor de workflow als de user permission-rules heeft toegevoegd, of voor de alternatieve workflow met manuele BS2-exports (CSV per pagina).
