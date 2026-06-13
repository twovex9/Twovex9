# v3 Fase D — Gap-report — BS1 vs BS2

**Status**: 📋 COMPLETE 2026-05-14
**Bron**: synthesis van Fase A (36 modules) + Fase B (data) + Fase C (storage)
**Doel**: gap-categorisatie + prioritering voor Fase E build

---

## Executive summary

BS1 is **100% functioneel pariteit** met BS2 voor read/edit-flows in alle 36 modules (na 69 bug-fixes). De resterende gaps zijn voornamelijk **v3-features** voor productie-launch:
- Bulk-onboarding 102 auth-accounts (Fase G)
- 2FA enrollment (Fase G)
- Drag-drop org-editor (Fase E)
- Optimistic locking conflict-modal (Fase E)
- Session-timeout auto-logout (Fase E)
- DSR-flow (Fase E)
- Read-audit (Fase E)
- PDF/print exports (Fase E)
- Bulk-acties (Fase E)
- Helpdesk-link (Fase G.8)

E-mail-flow is **expliciet niet** overgenomen (user-keuze #18: "GEEN e-mails ooit").

---

## 1. Schema-gaps (DB tabellen/kolommen/enums)

| Gap | Impact | Fix-locatie | Prio |
|---|---|---|---|
| `profiles.rol` enum naar 13 BS2-rollen (admin/medewerker/viewer → 12 BS2-rollen) | M (auth-rol-matrix) | Fase F | High |
| `profiles.must_change_password boolean` voor first-login flow | H (Fase G onboarding) | Fase G.1 migratie | High |
| `profiles.must_setup_2fa boolean` voor 2FA-enrollment flow | H (Fase G onboarding) | Fase G.1 migratie | High |
| `public.client_errors` tabel voor monitoring | M (debugging) | Fase 0.5 (al gedeeltelijk) | Med |
| Optimistic locking: `updated_at` check in alle UPDATE statements | M (conflict-detection) | Fase E uitbreiding | Med |
| `helpdesk_settings` tabel (telefoon + email config) | L (Fase G.8) | Fase G.8 | Low |
| BS1 `gemeenten` tabel mist 78 records (BS1 238 vs BS2 316) | L (functioneel werkend, BS1 = subset) | Fase E import | Low |
| `incident_attachments` tabel ontbreekt | M (file-uploads voor incidenten) | Fase E migratie | Med |

**Totaal**: 8 schema-gaps, 3 High + 4 Med + 1 Low.

---

## 2. UI-gaps (knoppen/dropdowns/tabs/kolommen niet in BS1)

### Module 24 Facturen / Module 31 Teams: 4 stat-cards
- BS2: Totaal teams / Totaal medewerkers / Teamleiders / Locaties (top-cards)
- BS1: ❌ ontbreekt
- Prio: Med — visueel nice-to-have

### Module 30 Rollen: Drag-drop CRUD editor
- BS2: Opslaan / Reset / Nieuwe rol / Nieuwe sectie + drag-drop herordening
- BS1: read-only viewer
- Prio: Med — admin-feature, hand-off via SQL voor nu

### Module 31 Teams: Kolommen-kiezer + Laatst gewijzigd kolom
- BS2 heeft beide
- BS1 mist beide
- Prio: Low — search dekt grootste deel filter-functionaliteit

### Module 35 Mijn-gegevens: Active sessions tab
- BS2: device-lijst + IP + last-active + "Uitloggen op alle andere apparaten"
- BS1: ❌
- Prio: Med — security-feature

### Module 36 Manual: helpdesk-link in topbar
- BS1 Help-button is non-functional placeholder
- Prio: Med (Fase G.8)

### Module 34 Notificaties: category-grouping (HR/Cliënten/Planning/Financiën/Taken)
- BS2 toont per category
- BS1 toont flat lijst van 8 types
- Prio: Low — functioneel werkend

**Totaal**: 6 UI-gaps, 4 Med + 2 Low.

---

## 3. Behavior-gaps

### Optimistic locking (cross-user concurrent edits)
- Gap: wanneer 2 users tegelijk dezelfde record bewerken, last-write-wins zonder warning
- Fix: `updated_at`-check in UPDATE + conflict-modal "Deze record is door iemand anders gewijzigd. Pagina herladen?"
- Prio: **High** — voor 100+ medewerkers in productie

### Session-timeout idle-detector
- Gap: BS1 logt niet automatisch uit na X min idle
- Fix: `auth-guard.js` idle-detector + auto-logout (BS2-style)
- Prio: High — GDPR-conform

### Real-time updates (Supabase Realtime channels)
- Gap: live-binding niet geïmplementeerd in alle data-lagen
- Fix: `<naam>-data.js` modules subscriben op `postgres_changes` events
- Prio: Med — 2-tab refresh nu vereist; voor 100+ users belangrijker

### DSR-flow (GDPR Art. 17 vergetelheid)
- Gap: geen UI voor "Vergeet deze cliënt" (anonymiseer + behoud financiële records 7j)
- Fix: cliënt-detail-pagina knop + Node-script voor anonymisatie
- Prio: High — GDPR-compliance verplicht

### Off-boarding cascade
- Gap: deactivated profile heeft geen "Uit dienst sinds X" label op overzichten
- Fix: render check + label in alle hr-tabellen
- Prio: Med

**Totaal**: 5 behavior-gaps, 3 High + 2 Med.

---

## 4. Data-gaps (records ontbreken)

| Tabel | BS2 | BS1 | Gap |
|---|---|---|---|
| `auth.users` | 120 | 1 | **119 missing** (Fase G bulk-onboarding) |
| `kilometers` | 16 | 0 | 16 missing (Fase E import) |
| `gemeenten` | 316 | 238 | 78 missing (Fase E optional import) |

**Totaal**: 3 data-gaps, 213 records totaal.

---

## 5. Storage-gaps

| Bucket | BS2 files (verwacht) | BS1 files | Gap |
|---|---|---|---|
| client-documents | ~800 | 0 | ~800 |
| medewerker-documenten | ~300 | 0 | ~300 |
| beleidsdocumenten | ~25 | 0 | ~25 |
| incident-documenten | ~290 | 0 | ~290 |

**Totaal**: ~1415 files, ~1-5GB. Import gepland pre-go-live (per user-keuze #17).

---

## 6. Audit-gaps

### Write-audit ✅ (mostly covered)
- BS1 `audit_log` heeft 3610 records
- 7 resource-types, 6 acties geregistreerd
- Trigger-based auto-population voor: Beleidsdocument / Medewerker / Beschikking / Cliënt / Factuur / Incident / Verlofaanvraag
- Gap: Taak / Team / NotificatieType triggers missen

### Read-audit ❌ (volledig missing)
- Per user-keuze #22: read-audit voor GDPR-compliance
- Gap: SELECT-events op gevoelige tabellen (cliënt-detail, verzuim) niet gelogd
- Fix: trigger-based of explicit SELECT-wrapper in data-laag
- Prio: High — GDPR-compliance

**Totaal**: 2 audit-gaps, 1 High.

---

## 7. Real-time-gaps

- Supabase Realtime channels niet enabled op meeste tabellen
- BS1 data-lagen luisteren naar custom events (`ff:<naam>-updated`) maar niet naar postgres_changes
- Fix: `supabase.channel().on('postgres_changes', ...)` in elke data-laag
- Prio: Med — werkt zonder voor 1-user, kritiek voor 100+

---

## 8. E-mail-notificatie-gaps

**VERVALT** per user-keuze #18 (2026-05-13): "GEEN e-mails ooit, BS1 gebruikt in-app notification-bell only".

BS2 e-mails zijn vervangen door:
- In-app `notifications` tabel + `notification-bell.js` topbar
- `ff:notification-received` event voor live update
- `notification_reads` per-user read-state

✅ Geen actie nodig.

---

## 9. PDF/print-gaps

### BS2 print-knoppen vermeld
- Factuur PDF-export
- Beleidsdocument PDF-view
- Mogelijk: cliënt-overzicht print

### BS1 status
- Geen jsPDF integratie
- Geen print-CSS
- Browser print-knop werkt wel (Ctrl+P) maar layout niet print-geoptimaliseerd

### Fix
- Per page: print-CSS toevoegen (`@media print { ... }`)
- jsPDF voor factuur-export + beleidsdocument-view
- Prio: Med — gebruikers kunnen Ctrl+P gebruiken als workaround

---

## 10. Bulk-actie-gaps

### BS2 bulk-acties (vermeld in Fase A)
- Cliënten: bulk-archiveren / bulk-fase-wijziging
- Medewerkers: bulk-deactiveren
- Facturen: bulk-status-update / bulk-export
- Planning: bulk-shift-toewijzen

### BS1 status
- Geen checkbox-headers in tabellen
- Geen bulk-dropdown UI
- Geen RPC-functies voor bulk-mutations

### Fix
- Per relevante tabel: checkbox-kolom + select-all
- Bulk-dropdown ("Bulk acties: archiveren / fase wijzigen / export")
- Supabase RPC functions voor performante bulk-updates
- Prio: Med — voor 100+ medewerkers serieuze workflow

---

## 11. Optimistic-locking gap

Reeds gedocumenteerd in sectie 3 Behavior-gaps. **Prio: High**.

---

## 12. Session-timeout gap

Reeds gedocumenteerd in sectie 3 Behavior-gaps. **Prio: High**.

---

## 13. Retention-policy gap

### Per user-keuze #24
- Wettelijk min. 7j financieel
- Wettelijk min. 15j jeugdzorg
- BS1 heeft `gdpr_retention_run_v1()` SQL-functie

### Gap
- Functie bestaat maar wordt **niet automatisch geschedulet**
- Geen daily Supabase Edge Function trigger
- Per user-keuze 0.6 NIET nodig (Supabase Pro doet backups)
- Maar retention-enforcement (DELETE oude records) MOET gebeuren

### Fix
- Supabase Edge Function: daily cron → `gdpr_retention_run_v1()`
- Of: postgres pg_cron extension
- Prio: Med — kritiek voor GDPR-audit, niet voor functionaliteit

---

## 14. DSR-flow gap (Data Subject Rights)

Per user-keuze #28b:
> Per cliënt: 'GDPR-export' (PDF+JSON) + 'Vergeet deze cliënt' (anonymiseer) voor admin-tier

### BS1 huidige stand
- Mijn-gegevens.html voor user-eigen JSON-export ✅
- Cliënt-detail GDPR-export ❌
- Cliënt anonymiseer-flow ❌

### Fix
- Cliënt-detail-pagina: "GDPR-export" button (admin-tier only) → PDF+JSON
- "Vergeet deze cliënt"-button → anonymiseer naam/BSN → UUID, behoud financiële records 7j
- Prio: High — GDPR-verplichting

---

## 15. Off-boarding cascade gap

Per user-keuze #28c:
> Records behouden + gedeactiveerde profile blijft als FK; geen nieuwe acties; audit-trail intact

### BS1 status
- Profiles.archived = true werkt voor profile-row
- Gap: alle aangemaakte records (planning, notities, etc.) blijven FK naar oude profile.id ✅
- Gap: geen "Uit dienst sinds X" label in UI
- Gap: deactivated user-account blokkeert nieuwe logins ❌ (auth blocking nog niet)

### Fix
- Render label in HR-overzichten
- Auth-side: `archived = true` → block sign-in via Hook (Supabase Edge function)
- Prio: Med

---

## 16. Permissies-matrix gap (12 rollen)

Per user-keuze #14: 1-op-1 BS2-spiegel, 12 rollen scrapen (skip medewerkertest).

### BS1 huidige stand
- `profiles.rol` ondersteunt: admin / medewerker / viewer (3 rollen)
- `profiles.rol_id` (FK → `org_roles`) ondersteunt: 14 rollen via Module 30 schema

### Fix (Fase F)
- Migration: `profiles.rol` enum naar 13 BS2-rollen
- RLS-policies refactor met `current_user_rol()` helper
- UI-conditionals: `ffCan(action, entity)` in `profiles-data.js`
- Sidebar-filter per rol
- 12 test-accounts per rol → side-by-side parity

**Prio: High**, **Fase F** (na E).

---

## 17. Helpdesk-link gap (Fase G.8)

Per user-keuze #27 + Module 36:
- Topbar Help-button → modal met admin-contactinfo
- Telefoonnummer + mailto-link
- Configureerbaar via Instellingen
- BS1 verstuurt zelf niets (mailto opent user's mail-client)

**Prio: Med**, **Fase G.8**.

---

## Prioritering voor Fase E

### High-prio (must-do voor go-live)
1. ✅ Schema-gaps: rol-enum + must_change_password + must_setup_2fa
2. ✅ Optimistic locking + conflict-modal
3. ✅ Session-timeout auto-logout
4. ✅ DSR-flow (cliënt-anonymiseer + GDPR-export)
5. ✅ Read-audit voor gevoelige tabellen
6. ✅ Retention-policy daily cron

### Medium-prio (nice-to-have, kan post-go-live)
1. Real-time channels
2. Bulk-acties UI + RPC
3. PDF/print exports
4. 4 stat-cards op Teams + Facturen
5. Drag-drop org-editor (Module 30)
6. Off-boarding label + auth-blocking
7. `incident_attachments` tabel

### Low-prio (later iteratie)
1. Kolommen-kiezer toevoegen aan Module 31
2. Active sessions tab (Module 35)
3. Category-grouping notificaties (Module 34)
4. `gemeenten` 78 missing records
5. BS2 "test" sectie in rollen (Module 30)

---

## Volgende fase

**Fase E — Build + fix-PRs** start per gap-categorie sequentieel.

Conform v3-plan: **15 sub-fasen** in Fase E (Schema → UI → Behavior → Data → Storage → Audit → Real-time → E-mail (vervallen) → PDF/print → Bulk → Optimistic-locking → Session-timeout → Retention → DSR → Off-boarding).

Verwachte effort: 18-45u (per v3-plan).

📌 Klaar voor Fase E kickoff na user-merge.
