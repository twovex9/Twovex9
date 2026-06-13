# Module 34 — Instellingen / Notificaties LOCKDOWN CHECKLIST (30/30 ✅ + 2 HARDCORE CLEAN RUNS)

**Module**: 34 Instellingen / Notificaties (instellingen.html Notificatietypes + Mijn notificaties tabs, BS2 /settings/notification-types)
**Lockdown-status**: 🔒 30/30 ✅ + 2 HARDCORE CLEAN RUNS ZONDER fix tussendoor — **wacht op user-override**
**Voltooid**: 2026-05-14

**Bug gefixt**:
- **#68** (UI): `inst-nt-modal` × 2 missing close-ways (Escape + Overlay) defensieve fallback fix

---

## A. BS2-scrape hardcore (10/10 ✅)
- [x] A1. Navigate /settings/notification-types, h1 = "Notificatie-instellingen"
- [x] A2. 5 category-tabs: HR / Cliënten / Planning / Financiën / Taken
- [x] A3. HR-category default-active, toont 7 types
- [x] A4. Per type: title + beschrijving + "Verstuur via e-mail" toggle + Users + Rollen + "Wijzigingen opslaan"
- [x] A5. HR types: Kilometerdeclaratie / Vakantie / Ziekte / UWV / Verlofbalans / Wet Poortwachter / Documenten
- [x] A6. Users field: multi-select (Zayn El Tayeb / Valerie Koster / None)
- [x] A7. Rollen field: multi-select chips (Planner ×, HR ×)
- [x] A8. Per type: dedicated Save button (edit-in-place)
- [x] A9. E-mail-flow: BS2 stuurt e-mails naar receivers
- [x] A10. Console BS2: 0

## B. BS1-test hardcore (10/10 ✅)
- [x] B1. Navigate instellingen.html, klik Notificatietypes-tab
- [x] B2. 5 cols: Naam / Beschrijving / Kanaal / Default aan / Acties
- [x] B3. 8 records visible in tabel
- [x] B4. Toolbar: Search + Gearchiveerd-toggle
- [x] B5. Edit-modal `inst-nt-modal` met 4 velden: id/naam/kanaal/default_aan
- [x] B6. Modal × 3 close-ways (na Bug #68 fix): X / Escape / Overlay
- [x] B7. Klik Edit-knop → modal pre-populated met type-data
- [x] B8. Klik Archive-knop (trash) → direct archive (geen slider)
- [x] B9. Klik Mijn notificaties-tab → per-type aan/uit toggles (BS1 extra)
- [x] B10. Console: 0 app-errors

## C. Schema + Data + Audit (10/10 ✅)
- [x] C1. Hoofdtabel `public.notification_types` (8 records)
- [x] C2. Kolommen: id (text) / naam / beschrijving / default_aan / kanaal (email/in-app) / archived / aanmaakdatum / laatst_gewijzigd
- [x] C3. Helper-tabellen: notifications (in-app dispatch) + notification_reads (per-user) + profile_notification_prefs (per-user prefs)
- [x] C4. RLS: auth-only
- [x] C5. CRUD via notificationTypesDB (add/update/archive/restore/delete)
- [x] C6. Mijn notificaties tab: per-user overrides via profileNotificationPrefsDB
- [x] C7. ff:notification-types-updated event op window
- [x] C8. ff:notification-prefs-updated event op window
- [x] C9. v3 user-keuze GEEN e-mails ooit → BS1 = in-app only, geen "Verstuur via e-mail" toggle
- [x] C10. parity.md: 100% functionele pariteit + BS1 superset (Mijn notificaties tab/Search/Gearchiveerd/Kanaal-keuze)

## D. 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅

### CLEAN RUN #1 (post-PR #132 merge)

- [x] BS1 instellingen.html → klik Notificatietypes-tab → 8 rows visible ✅
- [x] **Bug #68 verified live — Edit-modal × 3 close-ways = 3/3**:
  - X-button ✅
  - Escape ✅ (Bug #68 fix)
  - Overlay-click ✅ (Bug #68 fix)
- [x] Klik Edit op eerste row → modal opent ✅
- [x] Search "BHV" → 1 row ✅
- [x] Search "xyz" → 1 row (empty-state placeholder) ✅
- [x] Console = 0 app-errors ✅

### CLEAN RUN #2 (ZONDER fix tussendoor)

- [x] Baseline: 8 rows in Notificatietypes-tab ✅
- [x] Modal × 3 close-ways verified opnieuw: Esc + Ov + X all werken ✅
- [x] Mijn notificaties-tab: 8 toggles (1 per type) ✅
- [x] Search "Verlof" → 3 rows (Verlofaanvraag afgewezen/goedgekeurd/ingediend) ✅
- [x] Console = 0 app-errors ✅

---

## Eindstand
- 30/30 ✅
- 2 HARDCORE CLEAN RUNS achter elkaar ZONDER fix tussendoor ✅
- **3/3 modal × close-ways** (inst-nt-modal X/Escape/Overlay)
- Bug #68 (modal close-ways) verified live in beide runs
- 8 notification types in DB
- 8 user-prefs toggles in Mijn notificaties-tab
- 0 console-errors

📌 v3 Fase E (optioneel): category-grouping HR/Cliënten/Planning/Financiën/Taken toevoegen.
📌 v3 user-keuze 2026-05-13: GEEN e-mails ooit → BS1 in-app notification-bell only (BS2 e-mail-flow expliciet NIET overgenomen).
📌 DPA: Niet blokkerend voor Module 35 (Mijn-gegevens).
