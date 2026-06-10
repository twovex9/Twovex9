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
- [x] G41 — SKJ-saldo-badge in Functioneren-tab (som skj_punten van geldige opleidingen). Herregistratie-zicht via G42-recertsectie. PR #605.
- [x] G26 — beleid_kennisname-tabel + RPC hr_beleid_kennisname_pct + "Verplicht beleid"-sectie in hub (mijn-beleid.js): 9 vaste docs, gelezen+ondertekend+datum. `hr_v4_beleid_kennisname.sql`.
- [x] G36 — functioneringsgesprekken-tabel + UI (Functioneren-tab medewerker-functioneren.js).
- [x] G37 — functionering_doelen (Ontwikkeldoelen-sectie).
- [x] G38 — verbetertrajecten (sectie + CRUD).
- [x] G39 — medewerker_waarschuwingen (sectie + CRUD).
- [x] G20 — jaaropgaven: tabel + private bucket + RLS (eigen/HR) + "Mijn jaaropgaven"-sectie in hub (mijn-jaaropgaven.js). `hr_v4_jaaropgaven.sql`. HR-upload-UI op de loonstroken-pagina (jaaropgave-sectie). COMPLEET.
- [x] G28 — HR-controlevinkje per gevonden vereist document (traject.data.docCheck) + VOG-leeftijdscheck "Ouder dan 3 mnd" (uploaddatum, badge). PR #603.
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
- [x] G21 — salarishistorie: medewerker_salaris_historie + dossier-trigger + backfill + "Mijn salarisontwikkeling" in hub. PR #605.

### Fase 3 — Dossier + portaal-UI (PC + mobiel)  [ ]
- [x] G14 — nationaliteit · G15 — afdeling · G18 — IBAN (PR #587) · **G16 — leidinggevende** (Details-tab veld emp-leidinggevende → medewerkers.data, mirror G14/15/18-patroon)
- [x] G17 — Mijn Profiel leesbare cards (telefoon/adres/geboortedatum/startdatum/contract/afdeling/personeelsnummer) in mijn-gegevens.js renderSummary.
- [x] G19 — Mijn Salaris: loonstroken-view. PC ✅ (mijn-loonstroken.js + sectie in mijn-gegevens.html, RLS-gescoped, download via signed URL). Mobiel ✅ (route /salaris, salaris.ts, future-flow-mobile PR #2, live-geverifieerd qa-medewerker licht+donker: Mei 2026 + signed-URL OK). Historie(G21) apart.
- [x] G22 — eigen verlofsaldo self-service: PC ✅ (mijn-verlof.js, sectie in hub). Mobiel ✅ (/verlof kpi-tegels wet/bovenwet).
- [x] G23 — verlof aanvragen self-service: PC ✅ (form → verlofDB.add+indienen, route teamleider→HR). Mobiel ✅ (dienVerlofIn → status ingediend + route Zorgcoördinator + notify; live end-to-end getest: aanvraag → "In behandeling", opgeruimd).
- [x] G24 — mobiel verlof-statusmapping fix: STATUS_NL 1-op-1 met desktop (concept/ingediend/goedgekeurd/afgewezen/geannuleerd; in_afwachting=legacy-alias). Live: 'ingediend' → "In behandeling".
- [x] G25 — verloftypes-beheer: tabel+seed+RLS, beheer-UI op verloftypes-pagina, formulier dynamisch. PR #605.
- [x] G27 — toegangschecklist uitgebreid naar 5 items (+ Toegangspas/sleutels). PR #603.
- [x] G29 — onboarding-stap "Inwerkgesprekken & evaluatie" (week 1 / maand 1 / einde proeftijd, afvinkbaar+dateerbaar). PR #603.
- [x] G42 — "Recertificering & trainingen"-sectie op compliance-dashboard (hr_recertificering_overzicht + hr_agressie_training_aantal). PR #605.

### Fase 4 — Document/verloop-UI + onboarding-flow  [ ]
- [x] G10 — 90/60/30 gelaagdheid + SKJ/Verzekeringen-categorie + pushSoon certificeringen (PR #589).
- [x] G11 — canoniek doc-type-model gesynct: edge slaat canonical lowercase op (legacy-labels genormaliseerd; fixte compliance-mismatch), pagina value/label, dossier ongewijzigd. PR #603.
- [x] G12 — ONB_REQUIRED_DOCS bestond volledig; per-rij expiry-badge toegevoegd (Verlopen / Verloopt over Xd). PR #603.
- [x] G13 — verloopdatum-veld in publieke uploadform + ISO-validatie in de edge (server-getest: vervaldatum_date gevuld). PR #603.
- [x] G30 — edge onboarding-mail (SMTP-mechanisme salarisexport, dry_run, office-gate+audit) + "Mail naar medewerker"-knoppen. Server-getest (dry-run 200, 403 voor medewerker). Verstuurt zodra eigenaar SMTP-creds invult. PR #603.

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
- [x] G55 — generiek per-rol slug-plan-gereedschap `scripts/rol-permissies.mjs` (--list/--dump/--diff/--apply met dry-run+--yes; JSON-plannen reproduceerbaar/omkeerbaar). Getest read-only op prod (15 rollen; beleid dump→diff = 0/0).
- [x] G56 — `strict: true` op de salaris-gevoelige pagina's (salarishuis ×2, salarisadministratie-exporter, loonstroken, compliance-dashboard): admin-tier-bypass uit, alleen expliciete rollen (zelfde fail-closed model als Financiën). Cold-cache fail-closed bestond al (PR #568).
- [x] G57 — herbruikbare `besaApplyReadOnly(roles, {scope, banner})` in permissions.js: disable't invoer + verbergt muterende knoppen (MutationObserver voor dynamische content), admin-tier blijft volledig, zoekvelden blijven werken, data-ro-keep/-hide opt-outs, één banner.

### Fase 6 — Notificatie-cron + infra  [~]
- [x] G8  — `notify_vervallende_documenten()` dagelijkse digest-cron (verlopen/30/60/90) → HR. Server-getest (dedup OK). `hr_v4_verloop_documenten_cron.sql`. KERN-DIFFERENTIATOR.
- [x] G32 — `notify_poortwachter_deadlines()` dagelijkse digest-cron (te laat/binnen 14d) → HR. Server-getest. `hr_v4_poortwachter_signalering_cron.sql`.
- [x] G31 — Frequent-verzuim-KPI (Bradford S2xD, 52wk, drempel 125, tooltip met namen). PR #606.
- [x] G33 — week-1-melding arbodienst + 42e-weeksmelding UWV als eigen WP-mijlpalen. PR #606.
- [x] G34 — WP-traject automatisch aangemaakt bij ziekmelding (seedTraject). PR #606.
- [x] G35 — verzuim_acties (tabel+RLS+datalaag+UI) + uitgevoerd_door op contactmomenten/acties met naamweergave. PR #606.
- [x] G46 — bucket private + batch signed URLs + storage-RLS office-of-eigen. Server-geverifieerd (anon 400 / office 200 / cross-sign 400). PR #604.
- [x] G58 — scripts/deploy-functions.mjs (Management-API edge-deploy, bewezen) + scripts/apply-migrations.mjs. PR #603.
- [x] G58 — scripts/deploy-functions.mjs (Management-API edge-deploy, bewezen) + scripts/apply-migrations.mjs. PR #603.
- [x] G59 — DDL-route + canonieke URL's gedocumenteerd in `docs/hr-module/DEPLOY.md` (db-exec, web/mobiel-deploy incl. twovex9-credential-truc, RLS-impersonatie-test, edge-blocker-noot).

## ✅ EINDSTATUS 2026-06-10 — ALLE 58 GAPS AFGEROND (G52 gedropt door eigenaar)
Geen open gaps meer. Enige acties die op de eigenaar wachten (geen code):
- SMTP-wachtwoord + afzender-e-mail invullen (Salarisadministratie → E-mailinstellingen) → activeert salarisexport-mail (G7) en onboarding-mail (G30); beide functies valideren en melden dit nu netjes.
- Salarisdata (schaal/trede/uurkostprijs) en opleidings-koppelingen vullen → personeelskosten-KPI's en SKJ-saldi worden vanzelf representatief (alles is al "eerlijk-bij-dunne-data" gelabeld).

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

### ✅ Acceptatie-resultaat 2026-06-10 (sessie #3, 100%-afronding) — GEHAALD
Alle 4 rollen, elk 2 runs (licht + donker), geen app-console-fouten (alleen de bekende
Chrome-extensie-vendor.js-melding). Nieuwe features end-to-end live getest:
- **qa-hr** ✅✅ — verloftypes-CRUD (toevoegen→toggle→slider-delete), compliance recert-sectie
  (19 verlopen / 18 ≤90d / agressie 4, 37 rijen), verzuim Bradford-KPI (3 frequente, tooltip),
  acties-CRUD (toevoegen→afvinken→verwijderen, "door <naam>"), dossier-onboarding (7 stappen
  incl. Inwerkgesprekken & evaluatie, 5-items-toegang, mail-knop, gesprek-afvink+datum
  persisteert in traject.data), SKJ-saldo-badge, documenten = signed URLs (G46),
  loonstroken-pagina met jaaropgaven-upload-sectie (28 mw-opties).
- **qa-medewerker** ✅✅ — Mijn salarisontwikkeling-sectie (correcte lege staat), verlof-form
  dynamisch uit de verloftypes-tabel (7), loonstrook signed-URL OK.
- **qa-directeur** ✅✅ & **qa-eigenaar** ✅✅ — management-dashboard 8 HR-kaarten, strikte
  salarispagina's toegankelijk voor de juiste rollen, planning-personeelskosten-KPI.
- **Publieke onboarding-upload** ✅ — verloopdatum-veld + canonical types met NL-labels.
- 1 bug gevonden in de live-run (acties-knoppen misten in de delegation-selector) →
  gefixt (PR #608) → flow volledig clean herhaald.

**Sessie #3 PR's:** #603 (G11-13/27-30/58 onboarding+infra) · #604 (G46 bucket private) ·
#605 (G21/25/41/42) · #606 (G31/33/34/35 verzuim) · #607 (G55/56/57 + G20-rest) · #608 (fix).
