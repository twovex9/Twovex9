# HR Management Systeem — bouwplan & gap-matrix

**Bron:** user-spec "ETF HR Management Systeem" (2026-06-09) + 11-mapper audit-workflow.
**Status:** ~55-60% bestond al. 58 actieve gaps (G52 gedropt). Source of truth voor voortgang.

## Scope-keuzes (user, bindend)
1. Medewerkersportaal (Mijn Salaris/Verlof/Documenten) → **PC (Future-Flow-etf) ÉN mobiel (Future-Flow Mobile)**.
2. Loket → **XLSX-export uitbreiden + auto-mail** (geen echte API).
3. Add-ons → **volledige functioneringscyclus + gestructureerde opleidingsmodule** (catalogus + afronding-tracking, geen video-LMS).
4. Vacatures/werving → **OVERSLAAN** (G52 dropt; dashboards laten 'open vacatures'/'tijd-tot-invulling' weg).

## Defaults (zelf gekozen)
- Werkgeverslasten = 1 org-brede instelbare setting (default 30%).
- Netto = instelbare benaderingsfactor ("indicatief").
- Verzuim-consolidatie via FK (medewerker_verzuim_perioden ↔ verzuim).
- Server-side RLS via live `bs2`-rolpatroon (is_hr_admin_bs2 / bs2_role_users; NIET org_roles).
- Compliance-score = transparante gewogen samenstelling.
- Dashboards: HR-Compliance apart + management-dashboard met rol-gegate Directeur/Eigenaar-secties.

## Wat al 100% staat (NIET opnieuw bouwen)
Personeelsdossier (NAW/BSN/contract/IBAN/noodcontact in medewerkers.data jsonb) · doc-upload + Storage ·
contract-flow (7 CAO-templates + digitaal ondertekenen + PDF via contract-sign) · verzuim/Poortwachter-dossier
(9 WP-mijlpalen + contactmomenten + privé bucket) · Loket-XLSX-export + ORT-engine · 2-staps verlof-goedkeuring ·
mijn-uren + mijn-beschikbaarheid · salarishuis (CAO-lookup + audit) · client-side permissiesysteem.

## Bouwfasen (volgorde = dependency-correct)

### Fase 0 — SQL-fundament + reproduceerbaarheid  [x] (toegepast op prod + geverifieerd, `hr_v4_fase0_fundament.sql`)
- [x] G9  — vervaldatum_date (trigger-onderhouden, generated kon niet: to_date niet immutable) + index. 281 geparsed, 0 unparsed-nonempty.
- [x] G43 — verzuim_mijlpalen + verzuim_contactmomenten DDL + office-only RLS (waren open); verzuim write-gating office.
- [~] G45 — RLS-helpers (is_hr/is_office_staff/is_eigen_medewerker/can_view_management) gespiegeld. REST volgt: gdpr_my_data_export, management_dashboard_v1, bs2_*/org_roles DDL (bij Fase 5).
- [x] G47 — verzuim.medewerker_id text + index toegevoegd. Backfill via naam-match volgt bij KPI-bouw (Fase 5/6).

### Fase 1 — Nieuwe HR-datalagen + tabellen  [ ]
- [x] G40 — opleidingen-catalogus uitgebreid (categorie/geldigheidsduur_maanden/skj_punten/is_academy) + koppeltabel medewerker_opleidingen (certificaat/herhaaldatum). `hr_v4_addons.sql`. UI in Functioneren-tab.
- [~] G41 — SKJ-punten per opleiding-koppeling (veld). Saldo-aggregatie + herregistratie-overzicht nog te doen.
- [ ] G26 — beleid_kennisname (gelezen+ondertekend+datum) + seed 9 vaste beleidsdocs
- [x] G36 — functioneringsgesprekken-tabel + UI (Functioneren-tab medewerker-functioneren.js).
- [x] G37 — functionering_doelen (Ontwikkeldoelen-sectie).
- [x] G38 — verbetertrajecten (sectie + CRUD).
- [x] G39 — medewerker_waarschuwingen (sectie + CRUD).
- [x] G20 — jaaropgaven: tabel + private bucket + RLS (eigen/HR) + "Mijn jaaropgaven"-sectie in hub (mijn-jaaropgaven.js). `hr_v4_jaaropgaven.sql`. HR-upload-UI nog (kan via loonstroken-patroon).
- [ ] G28 — onboarding documentcontrole-status (HR verificatie/akkoord per doc) + VOG max-3mnd
- ~~G52~~ — vacatures: GEDROPT (user-keuze)

### Fase 2 — Salarisberekening + planning/loket  [~]
- [x] G1 — bruto uit schaal+trede+contracturen (live getSalarisschalen lookup, pro-rate 36u). `hr-salaris-berekening.js` + medewerker.js/html. Unit-getest.
- [x] G2 — werkgeverslasten% (config localStorage, default 30%; Supabase-settings-UI volgt Fase 5) + uurkostprijs.
- [x] G3 — indicatief netto (factor 0,70 default, instelbaar).
- [x] G4 — ZZP BTW% + uren/week → kostprijs/uur + kosten/week + kosten/maand. Unit-getest.
- [x] G1–G4 LIVE geverifieerd (Adriana Malovan Schaal7/trede4/36u → bruto €3.209,22 / wgl €962,77 / uurkost €26,76 / netto €2.246,45, geen app-console-fouten).
- [ ] G5 — planning-kosten op echte uurkostprijs + configureerbare wgl
- [ ] G6 — geaggregeerd dag/week/maand-personeelskosten-overzicht
- [ ] G7 — Loket-XLSX uitbreiden (overuren/ziekte/contract/salaris) + auto-mail
- [ ] G21 — salarishistorie self-service view

### Fase 3 — Dossier + portaal-UI (PC + mobiel)  [ ]
- [ ] G14 — nationaliteit · G15 — afdeling · G16 — leidinggevende · G18 — IBAN in Details (loondienst)
- [x] G17 — Mijn Profiel leesbare cards (telefoon/adres/geboortedatum/startdatum/contract/afdeling/personeelsnummer) in mijn-gegevens.js renderSummary.
- [~] G19 — Mijn Salaris: loonstroken-view. PC ✅ (mijn-loonstroken.js + sectie in mijn-gegevens.html, RLS-gescoped, download via signed URL). Mobiel + jaaropgaven(G20)/historie(G21) nog te doen.
- [~] G22 — eigen verlofsaldo self-service: PC ✅ (mijn-verlof.js, sectie in hub). Mobiel nog.
- [~] G23 — verlof aanvragen self-service: PC ✅ (form → verlofDB.add+indienen, route teamleider→HR). Mobiel nog.
- [ ] G24 — mobiel verlof-statusmapping fix
- [ ] G25 — verloftypes-beheer (verloftypes.js + tabel)
- [ ] G27 — onboarding toegangschecklist 5 spec-items
- [ ] G29 — gestructureerde inwerkgesprekken/evaluatiemomenten
- [ ] G42 — recertificering-overzicht + agressie-training

### Fase 4 — Document/verloop-UI + onboarding-flow  [ ]
- [ ] G10 — 90/60/30 gelaagdheid + SKJ/Verzekeringen-categorie + pushSoon certificeringen
- [ ] G11 — uitgebreid doc-type-model (4 plekken sync)
- [ ] G12 — volledige ONB_REQUIRED_DOCS + per-rij expiry-badge
- [ ] G13 — vervaldatum-veld in publieke onboarding-upload form
- [ ] G30 — automatische mail teken-/upload-/inwerklink

### Fase 5 — Dashboards + KPI's + rol-gating  [~]
- [x] G49 — `hr_compliance_overzicht()` + `hr_compliance_kpis()` RPC's (office-only gate), `hr_v4_compliance_rpc.sql`. Server-getest: 106 mw, 73 ZZP, 96% VOG geldig, 67 verlopen docs.
- [x] G48 — `compliance-dashboard.html` + `-data.js` + `.js`: KPI-tegels (VOG%, verlopen, onboarding%, ZZP%) + grids + per-medewerker drill-down-tabel (klik → dossier) + filters/zoek. Page-map (HR/admin-tier) + topnav HR-mega-menu. (LIVE te verifiëren)
- [x] G53 (deels) — VOG geldig%/aanwezig%, onboarding%, contract%, ZZP% op het dashboard. (Beleid% + SKJ% volgen met G26/G10.)
- [ ] G48 — Compliance(HR)-dashboard met KPI-tegels + HR-rol in page-map
- [ ] G50 — personeelskosten + ZZP%-KPI op bestuur-dashboard
- [ ] G51 — verlooppercentage-KPI
- [ ] G53 — Geldige VOG%/SKJ%/voltooide onboarding%/ondertekende beleid%  (zonder vacature-KPI's)
- [ ] G54 — samengestelde compliance-score
- [ ] G44 — server-side rol-RLS HR-kerntabellen
- [ ] G55 — per-rol slug-plan (scripts/<rol>-rol-permissies.mjs)
- [ ] G56 — fail-closed voor strikte HR-pagina's + page-map-entry
- [ ] G57 — herbruikbare besaApplyReadOnly(roles) helper

### Fase 6 — Notificatie-cron + infra  [~]
- [x] G8  — `notify_vervallende_documenten()` dagelijkse digest-cron (verlopen/30/60/90) → HR. Server-getest (dedup OK). `hr_v4_verloop_documenten_cron.sql`. KERN-DIFFERENTIATOR.
- [x] G32 — `notify_poortwachter_deadlines()` dagelijkse digest-cron (te laat/binnen 14d) → HR. Server-getest. `hr_v4_poortwachter_signalering_cron.sql`.
- [ ] G31 — frequent verzuim (Bradford/teller + KPI)
- [ ] G33 — week-1-mijlpaal + 42e-week UWV los van eerstejaarsevaluatie
- [ ] G34 — traject auto bij ziekmelding
- [ ] G35 — acties-entiteit + uitgevoerd_door op contactmoment
- [ ] G46 — medewerker-documenten bucket PRIVATE + signed URLs
- [ ] G58 — scripts/deploy-functions.mjs + scripts/apply-migrations.mjs
- [ ] G59 — README/CLAUDE.md DDL-route + canonieke URL bijwerken

## Test-eindeis
2 opeenvolgende clean Chrome-runs (licht + donker) via QA-accounts per rol op futureflow-etf.vercel.app —
geen enkele bug/console-fout. Per-rol verificatie (Medewerker/HR/Directeur/Eigenaar) van de spec-rolmatrix.
