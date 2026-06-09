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
- [x] G26 — beleid_kennisname-tabel + RPC hr_beleid_kennisname_pct + "Verplicht beleid"-sectie in hub (mijn-beleid.js): 9 vaste docs, gelezen+ondertekend+datum. `hr_v4_beleid_kennisname.sql`.
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
- [x] G5 — planning-kosten op echte uurkostprijs: nieuwe getPersoneelsUurkostForName (loondienst=uurkostprijsNum, ZZP=uurAlgemeen) → "Personeelskosten (indicatief)"-KPI in planning-overzicht, naast het bestaande diensttype-charge-tariefmodel. Toont "—" tot er uurkostprijs-data is (sparse: 1/106; groeit met HR-invoer).
- [x] G6 — geaggregeerd personeelskosten-overzicht: het planning-summary-paneel aggregeert al over de actieve (dag/week/maand-gescopte) view → de KPI's (incl. nieuwe personeelskosten) zijn het periode-totaal. Aparte breakdown-tabel niet nodig.
- [x] G7 — Loket-XLSX uitbreid: +kolommen Overuren (indicatief, gewerkt boven maandnorm), Ziekteverzuim (uren, uit verzuim-perioden), Contractvorm, Bruto maandsalaris (uit dossier; sparse). Achteraan toegevoegd zodat BS2-kolomblok ongewijzigd. medewerker-verzuim-data.js bijgeladen. ⏳ auto-mail uitgesteld (vereist edge-functie-deploy `salarisexport-mail` + SMTP-config = infra-blocker, zie G58).
- [ ] G21 — salarishistorie self-service view

### Fase 3 — Dossier + portaal-UI (PC + mobiel)  [ ]
- [x] G14 — nationaliteit · G15 — afdeling · G18 — IBAN (PR #587) · **G16 — leidinggevende** (Details-tab veld emp-leidinggevende → medewerkers.data, mirror G14/15/18-patroon)
- [x] G17 — Mijn Profiel leesbare cards (telefoon/adres/geboortedatum/startdatum/contract/afdeling/personeelsnummer) in mijn-gegevens.js renderSummary.
- [x] G19 — Mijn Salaris: loonstroken-view. PC ✅ (mijn-loonstroken.js + sectie in mijn-gegevens.html, RLS-gescoped, download via signed URL). Mobiel ✅ (route /salaris, salaris.ts, future-flow-mobile PR #2, live-geverifieerd qa-medewerker licht+donker: Mei 2026 + signed-URL OK). Historie(G21) apart.
- [x] G22 — eigen verlofsaldo self-service: PC ✅ (mijn-verlof.js, sectie in hub). Mobiel ✅ (/verlof kpi-tegels wet/bovenwet).
- [x] G23 — verlof aanvragen self-service: PC ✅ (form → verlofDB.add+indienen, route teamleider→HR). Mobiel ✅ (dienVerlofIn → status ingediend + route Zorgcoördinator + notify; live end-to-end getest: aanvraag → "In behandeling", opgeruimd).
- [x] G24 — mobiel verlof-statusmapping fix: STATUS_NL 1-op-1 met desktop (concept/ingediend/goedgekeurd/afgewezen/geannuleerd; in_afwachting=legacy-alias). Live: 'ingediend' → "In behandeling".
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
- [x] G50 — personeelskosten (indicatief) + ZZP%-KPI op management-dashboard via `hr_bestuur_kpis()` (can_view_management). Personeelskosten eerlijk gelabeld met "N van M dossiers" (salaris-data dun, 19/106). `hr_v4_bestuur_compliance_kpis.sql`.
- [x] G51 — verlooppercentage-KPI (uit dienst / totaal) op management-dashboard via hr_bestuur_kpis. Eerlijk: thin data (1 uit dienst → 0,9%).
- [x] G53 — Geldige VOG% + onboarding% + contract% + beleid%-tegels op compliance-dashboard. SKJ als absoluut aantal "geldige SKJ-registraties" (geen misleidend % zonder duidelijke noemer; SKJ-bron = education-doc met 'skj' in naam). Vacature-KPI's bewust weggelaten.
- [x] G54 — samengestelde compliance-score (transparant: 30% VOG + 20% onboarding + 25% contract + 25% beleid) op compliance-dashboard én management-dashboard. Server-getest qa-hr=29, qa-eigenaar bestuur-KPI's OK, qa-medewerker gated=0.
- [x] G44 — server-side rol-RLS HR-kerntabellen. `hr_v4_rls_hardening.sql` toegepast op prod. medewerkers (writes office-only, SELECT open), verlof_aanvragen (SELECT/INSERT/UPDATE office-of-eigen, DELETE office), medewerker_notities (SELECT office-only), medewerker_verzuim_perioden (SELECT office-of-eigen), medewerker_verlof_overgedragen (SELECT office-of-eigen, writes office). Server-geverifieerd via role-impersonatie: medewerker ziet eigen verlof/0 notities, cross-write + medewerker-insert → 42501 geweigerd; office ziet alles. bureau_lockout (RESTRICTIVE) composeert AND.
- [x] G45 — `management_dashboard_v1` RPC gespiegeld naar `supabase/migrations/management_dashboard_v1.sql` (auditeerbaar; idempotent gevalideerd op prod). RLS-helpers al in Fase 0; bs2_*=datatabellen.
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
- [ ] G58 — scripts/deploy-functions.mjs + scripts/apply-migrations.mjs
- [x] G59 — DDL-route + canonieke URL's gedocumenteerd in `docs/hr-module/DEPLOY.md` (db-exec, web/mobiel-deploy incl. twovex9-credential-truc, RLS-impersonatie-test, edge-blocker-noot).

## ⏳ RESTERENDE GAPS — status & reden (na sessie 2026-06-09 #2)
**Data-geblokkeerd** (code zou kloppen maar brondata ontbreekt → toont leeg/0; vergt HR-invoer):
- G41 SKJ-saldo + G42 recertificering/agressie → `medewerker_opleidingen`-koppeltabel is leeg (0 rijen).
- (personeelskosten/verloop al "indicatief" gelabeld in G50/G51.)

**Infra-geblokkeerd** (vergt edge-function-deploy + secrets; G58 deploy-script bestaat nog niet):
- G7-auto-mail (`salarisexport-mail`), G13 onboarding-upload doc-types (ALLOWED_TYPES in edge), G30 auto-mail teken/upload/inwerklink.

**Groot/risicovol — eigen sessie aanbevolen** (niet half doen vóór de clean runs):
- G46 docs-bucket PRIVATE + signed URLs (blast-radius: medewerker.js/mijn-documenten/doc-status/warnings → moet doc-viewing app-breed ombouwen).
- G21 salarishistorie self-service · G25 verloftypes-beheerpagina · G27/G29 onboarding-checklist/gesprekken · G31 Bradford-verzuim · G33/G34/G35 verzuim-WP-uitbreidingen · G11/G12 doc-type-model · G56/G57 gate-robustheid+besaApplyReadOnly.

## Test-eindeis
2 opeenvolgende clean Chrome-runs (licht + donker) via QA-accounts per rol op futureflow-etf.vercel.app —
geen enkele bug/console-fout. Per-rol verificatie (Medewerker/HR/Directeur/Eigenaar) van de spec-rolmatrix.

### ✅ Acceptatie-resultaat 2026-06-09 (sessie #2) — GEHAALD voor het geleverde scope
Alle 4 rollen, elk 2 runs (licht + donker), **geen enkele app-console-fout** (alleen de Chrome-
extensie-`vendor.js` "No Listener"-melding, die niet van de app is):
- **qa-medewerker** ✅✅ — nav-gating correct (HR verborgen; Cliënten zichtbaar = correct: loondienst-test, locatie-gescoped); mijn-gegevens (loonstroken/jaaropgaven/verlof/beleid), planning, mijn-uren.
- **qa-hr** ✅✅ — HR-nav; hr (106 rijen); compliance-dashboard score-tegels [29% / 0% / 5]; medewerker-detail + nieuw leidinggevende-veld + Functioneren-tab; salarisadministratie-exporter (verzuim-laag geladen).
- **qa-directeur** ✅✅ & **qa-eigenaar** ✅✅ — management-dashboard 8 HR-kaarten incl. bestuurs-KPI's (personeelskosten €85.372 indicatief / ZZP 68,9% / verloop 0,9% / compliance-score 29%); compliance-dashboard score-sectie.

Mobiel (future-flow-mobile.vercel.app, qa-medewerker, licht+donker): /salaris (loonstroken+jaaropgaven+signed-URL) en /verlof (saldo + aanvraag → "In behandeling") end-to-end getest.

⚠️ qa-identity-switch in één tab: na cache-wis toont de 1e load alle nav-links; 1× reload → nav-hide
pruned correct uit `besa-permissions-v2`. Echte gebruikers (persistente sessie) hebben dit niet.

NB: de loonstrook-mei-2026 + jaaropgave-2025 + bucketbestanden op test-medewerker `fa11c0de-…0001`
zijn bewust NIET verwijderd (QA-demo-fixtures; verwijderen = destructief → eigenaarskeuze).
