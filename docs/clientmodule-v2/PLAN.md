# ETF Cliëntmodule 2.0 — bouwplan & spec-mapping

**Bron:** user-spec "ETF Cliëntmodule 2.0 — Complete Functionele Uitwerking" (2026-06-10), 26 secties.
**Doel:** volledig digitaal cliëntvolgsysteem: Aanmelding → Beoordeling → Intake → Wachtlijst → Plaatsing → Begeleiding → Evaluatie → Uitstroom → Nazorg.
**Status:** dit document is de source of truth voor voortgang over meerdere sessies. Per fase: bouwen → DB via `node scripts/db-exec.mjs --file ...` → PR + merge (Vercel-deploy) → live-verificatie met qa-accounts (2 clean runs, licht+donker).

## Bestaande situatie (verkenning 2026-06-10, 6-agent audit)

**Bestaat al (NIET opnieuw bouwen):**
- `clienten` (86, `id text`!, fase: in zorg/in aanvraag/uit zorg, rest in `data` jsonb) + lijst (clienten.html) + dossier (client-detail.html, 11 tabs: Details/Beschikkingen/Betalingen/Contacten/Notities/Documenten/Rapportages/Medicatie/Vragenlijsten/Incidenten/AVG).
- `client_contacten` (relatie vrij tekstveld, is_primair; GEEN gezaghebbend/adres/organisatie), `client_documents` (bucket `client-documents` = PUBLIC ⚠️, 7 categorieën), `client_rapportages` (leeg; RLS volledig open ⚠️; auteur_id wordt niet geschreven), `client_vragenlijsten` (3 hard-coded templates: intake/evaluatie/afsluiting), `client_medicatie` (+ aftekenlijst via RPC + uurlijkse cron).
- `beschikkingen` (151; geen gemeente/productcode-kolommen — gemeente komt van cliënt; `toegekend_uren`; fase-tekst). Verloop-herinneringen BESTAAN al: `beschikking_verloop_herinneringen()` (cron 07:00, mijlpalen 60/30/14/7/0 → notificaties directeur+zorgcoördinator+gekoppelde GW, log in `beschikking_verloop_log`). ⚠️ Dashboard-RPC's joinen via `clienten.data->>'bs2_id'`; frontend joint op `clienten.id` (dual-key).
- `incidenten` (146, client_id text) + incidenten-analyse-module (7 rol-gegate views, deterministische heuristiek), `klachten` (0; client_id bestaat maar UI vult 'm niet).
- Audit: `audit_log` + `trg_audit_clienten/beschikkingen/incidenten` + `besa-audit.js` (automatisch) + read-audit (AVG art. 15) + `anonymize_client`/`export_client_data`.
- Notificaties: `notifications`+`notification_reads`+bel; melding aanmaken = server-side insert vanuit SECURITY DEFINER fn/cron. pg_cron-patroon gevestigd (10 jobs). Edge-deploy via `scripts/deploy-functions.mjs`.
- Rollen (bs2_roles; let op name≠slug): Eigenaar/eigenaar(1), Admin/admin(2), Directeur/directeur(2), Cliëntbeheer/**beschikkingen-test**(3), Planner/planner(3), Zorgcoördinator/**teamleider**(3), Facilitair, Finance, Gedragswetenschapper, HR, Salarisadministratie(4), Beleid, Medewerker(5), Detacheringsbureau. Resolutie via profiles.email→bs2_role_users→bs2_roles.slug.
- Module-patroon (incidenten-analyse/mobiliteit): single-page + filter-chip viewtabs + `setVisible()` (style.display ÉN hidden), data-laag `callRpc` met fallback, SECURITY DEFINER RPC's met harde rol-check (fail-closed, UI cosmetisch), page-map-entry verplicht, topnav alleen via `scripts/rebuild-topnav.mjs`.

**Kern-valkuilen:** `clienten.id`/`beschikkingen.id`/`client_documents.id` = **text** → alle nieuwe tabellen `client_id text`. Locatie = naamstring. `[hidden]` vs class-display → `setVisible`-helper. `toISOString()` UTC-shift → lokale isoDate. qa-identity-switch → eerst `besa-permissions-v2`-cache wissen. plpgsql: geen geneste functies; `max(uuid)` bestaat niet. schema.sql ≠ productie; DDL via db-exec.mjs. Topnav nooit per pagina bewerken. Nieuwe pagina ALTIJD in permissions-page-map.js (anders default open).

## Architectuurkeuzes (defaults, gekozen 2026-06-10)

1. **Cliëntreis-status** = nieuwe kolom `clienten.reis_status text` met 13 canonieke slugs:
   `nieuwe_aanmelding, in_beoordeling, meer_info_nodig, intake_gepland, intake_afgerond, wachtlijst, plaatsing_gepland, actief, tijdelijk_gepauzeerd, uitstroom_gepland, uitgestroomd, nazorg, dossier_gesloten`.
   Legacy `fase` blijft bestaan en wordt bidirectioneel gesynct via trigger (reis→fase: aanmeld-/intake-/wachtlijststatussen→'in aanvraag', actief/pauze/uitstroom_gepland→'in zorg', uitgestroomd/nazorg/gesloten→'uit zorg'; fase-wijziging door legacy UI→reis_status alleen bijwerken als inconsistent). Backfill: in zorg→actief, in aanvraag→in_beoordeling, uit zorg→uitgestroomd. Statuslabels + pill-kleuren centraal in `clientreis-ui.js`.
2. **Tijdlijn** = `client_tijdlijn` (uuid, client_id text, event_type, titel, omschrijving, bron_tabel, bron_id, created_by, created_by_naam, created_at). Gevuld door triggers (statuswijziging, beschikking, incident, rapportage, zorgplan, evaluatie, uitstroom …) + handmatige events via RPC. Read via RPC met clienten-toegangscheck.
3. **Aanmelding** = `client_aanmeldingen`-tabel (uuid; alle §2-velden incl. verwijzer + aanmeldinfo jsonb-vrij) + bij indienen direct voorlopig clienten-record (reis_status='nieuwe_aanmelding', persoonsvelden ook naar clienten.data zoals bestaande dossiers). Contactpersonen → `client_contacten` + nieuwe kolommen `gezaghebbend bool`, `adres text`, `organisatie text`, `functie text`, `contact_rol text` (ouder/voogd/gezaghebbende/verwijzer/overig). Uploads → nieuwe PRIVATE bucket `aanmelding-documenten` (signed URLs; patroon medewerker-documenten PR #604).
4. **Publiek aanmeldportaal** = standalone `aanmeld-portaal.html` (geen auth-guard/topbar) → edge function `client-aanmelding` (verify_jwt=false, service-role): validatie, honeypot, rate-limit per IP (tabel `aanmeld_rate_limits`), bestands-allowlist, max 10MB/bestand. Intern bereikbaar via Cliënten-menu.
5. **Beoordeling** = interne pagina `aanmeldingen.html`; acties (goedkeuren/afwijzen/meer info/wachtlijst) via SECURITY DEFINER RPC `aanmelding_beoordeel` met harde rol-check in SQL: gedragswetenschapper/teamleider/directeur/admin/eigenaar (spec §3 + admin-tier). Elke beslissing → tijdlijn + notificatie + audit.
6. **Zorgplannen/signaleringsplannen/evaluaties** (fase 3) = eigen tabellen met workflow-status + ondertekening-records (patroon contract-sign: token-gevalideerde edge function, ook voor intake-verklaringen §4).
7. **AI-cliëntsamenvatting** (fase 3) = deterministische heuristiek-RPC (geen LLM), zoals incidentanalyse/workforce.
8. **Autorisatie-matrix (spec §16)** server-side waar het telt: nieuwe RPC's fail-closed; tarieven nooit in medewerker-RPC-payloads; `client_rapportages`-RLS aanscherpen in fase 3 (koppeling medewerker↔cliënt vereist voor INSERT; read office+gekoppeld).
9. **Dashboards** (fase 5) = één `clientmodule-dashboard.html` met rol-gegate views (Caseload GW §17 / Zorgcoördinator §18 / Directeur §19 / Eigenaar §20 / KPI §21) + drill-down (§22) naar lijst/dossier via bestaande querystring-patronen.
10. **Ouder-/voogdportaal (§26)** = expliciet TOEKOMSTIGE fase, buiten scope van dit plan (alleen voorbereid door tekenflow-tokens generiek te houden).

## Spec-mapping → fasen

| § | Onderdeel | Bestaat? | Fase |
|---|---|---|---|
| 1 | Cliëntreis 13 statussen + vastlegging in tijdlijn | fase-veld (3 waardes) | **1** |
| 2 | Aanmeldportaal (gegevens/verwijzer/contactpersonen/aanmeldinfo/uploads) | nee | **1** |
| 3 | Beoordelingsmodule (GW/zorgcoörd/directeur; 4 acties) | nee | **1** |
| 15 | Tijdlijn (auto, chronologisch) | nee | **1** (basis) + events groeien mee in 2–6 |
| 23 | Audittrail | audit_log+triggers bestaan | **1** (nieuwe tabellen aanhaken; UI-tab fase 6) |
| 4 | Intakemodule (7 analyses + 4 verklaringen + digitale ondertekening) | vragenlijst-template 'intake' | **2** |
| 5 | Wachtlijstmodule + dashboard | nee | **2** |
| 11 | Beschikkingsmodule (gemeente/product/productcode/uren/status + 90/60/30/verlopen) | grotendeels; geen productcode, mijlpalen 60/30/14/7/0, dossier-tab is demo-rij | **2** (kolommen+90d+dossier-tab live) |
| 6 | Actief dossier (zorginhoudelijk/organisatorisch/kwaliteit/documenten) | deels | **3** |
| 7 | AI-cliëntsamenvatting | nee | **3** |
| 8 | Rapportagemodule (5 typen, alleen gekoppelde medewerkers) | client_rapportages basis | **3** |
| 9 | Zorgplannen + workflow | nee | **3** |
| 10 | Signaleringsplannen | nee | **3** |
| 14 | Contactlogboek (6 typen) | nee | **3** |
| 12 | Automatische dossiercontrole (dagelijks, 7 checks) | nee | **4** |
| 13 | Evaluatiemodule (30/14/verlopen → GW+zorgcoörd) | nee | **4** |
| 17 | Caseload-dashboard GW | nee | **5** |
| 18 | Dashboard zorgcoördinator | nee | **5** |
| 19 | Dashboard directeur | nee | **5** |
| 20 | Dashboard eigenaar (cliënten/gemeenten/demografie/producten) | nee | **5** |
| 21 | KPI-dashboard | nee | **5** |
| 22 | Drill-down | querystring-patronen bestaan | **5** |
| 16 | Autorisaties-matrix | deels (RLS clienten) | doorlopend; eindcontrole **6** |
| 24 | Uitstroommodule | uitZorgDatum only | **6** |
| 25 | Nazorgmodule | nee | **6** |
| 26 | Ouderportaal | nee | toekomstig (buiten scope) |

## Fase 1 — Cliëntreis-fundament + aanmeldportaal + beoordeling  [x] ✅ AFGEROND 2026-06-10 (PR #617)
- [x] SQL `supabase/migrations/clientmodule_v2_fase1.sql` (idempotent):
  - [x] `clienten.reis_status` + backfill + check-constraint (13 slugs) + index + bidirectionele fase-sync-trigger + tijdlijn-trigger op statuswijziging.
  - [x] `client_tijdlijn` + RLS (read via clienten-toegang; insert alleen definer) + RPC `client_tijdlijn_lijst(p_client_id)` + `client_tijdlijn_voeg_toe(...)`.
  - [x] `client_aanmeldingen` (persoons-/verwijzer-/aanmeldvelden + status nieuw/in_beoordeling/meer_info/goedgekeurd/afgewezen/wachtlijst + besluit/beoordelaar/toelichting + client_id-koppeling) + `aanmeld_rate_limits` + RLS (office-read; geen anon).
  - [x] `client_contacten` +kolommen gezaghebbend/adres/organisatie/functie/contact_rol.
  - [x] RPC's: `aanmeldingen_lijst(p_status)`, `aanmelding_detail(p_id)` (incl. signed-url-paden), `aanmelding_beoordeel(p_id,p_actie,p_toelichting,p_reden_wachtlijst)` — rol-gates hard in SQL; notificaties naar beoordelaars bij nieuwe aanmelding (en naar GW'ers bij goedkeuring).
  - [x] private bucket `aanmelding-documenten` + storage-policies (office-read; insert alleen service-role).
- [x] Edge function `client-aanmelding` (verify_jwt=false): POST JSON+files(base64) → valideer → rate-limit → insert aanmelding + voorlopig clienten-record + contacten + uploads + notificatie. Deploy via deploy-functions.mjs.
- [x] `aanmeld-portaal.html` + `.js`: publiek formulier, alle §2-velden, meerdere contactpersonen, uploads, succes-scherm met referentienummer. Geen auth; eigen sobere styling op bestaande tokens.
- [x] `aanmeldingen.html` + `.js` + `aanmeldingen-data.js`: lijst (statusfilter-chips, teller), detail-modal (alle gegevens + documenten via signed URLs + tijdlijn) en 4 beoordeel-acties met slider-confirm; rol-gate page-map `{allowedRoles:[Eigenaar,Admin,Directeur,Zorgcoördinator,Gedragswetenschapper,Cliëntbeheer]}`.
- [x] `clientreis-ui.js` (status→label/pill-class, gedeeld) + reis-status-pill in client-detail vcard + Tijdlijn-tab in client-detail (chronologisch, event-iconen).
- [x] Topnav: "Aanmeldingen" in Cliënten-dropdown via rebuild-topnav.mjs (+ TOPIC_BY_PAGE); aanmeld-portaal NIET in nav (publieke URL).
- [x] Permissie-slugs `browse-aanmeldingen`/`beoordeel-aanmeldingen` (bs2_permissions + meta + rol-toekenning via scripts/rol-permissies.mjs).
- [x] Verificatie: RPC's server-side per rol getest + live 2 clean runs (licht+donker): qa-gedragswetenschapper, qa-zorgcoordinator, qa-directeur (beoordelen werkt), qa-medewerker + qa-finance (géén toegang aanmeldingen), publieke aanmelding end-to-end → verschijnt in lijst + dossier aangemaakt + tijdlijn-event. PR + merge.

## Fase 2 — Intake + ondertekening + wachtlijst + beschikking-uitbreiding  [x] ✅ AFGEROND 2026-06-10 (PR #619/620)
- [x] `client_intakes` (7 onderdelen §4 als secties: intakegesprek/veiligheids-/risico-/gezins-/onderwijs-/netwerk-/hulpvraaganalyse; status per onderdeel) — start automatisch bij goedkeuring; statusflow intake_gepland→intake_afgerond.
- [x] Digitale ondertekening: `client_ondertekeningen` (verklaring-type: privacy/toestemming/huisregels/informatieverstrekking; ondertekenaar-type: client/ouder/gezaghebbende/voogd; token-flow via edge function patroon contract-sign; PDF-vastlegging).
- [x] Wachtlijst: velden op clienten/aanmelding (urgentie, gewenst product, verwachte startdatum, reden wachtlijst) + `wachtlijst.html`-view (per cliënt §5) + dashboard-kaarten (aantal, gem. wachttijd, per gemeente, per product).
- [x] Beschikkingen: kolommen `gemeente`, `productcode` (+ UI detail/overzicht), 90-dagen-mijlpaal toevoegen aan `beschikking_verloop_herinneringen`, dossier-tab "Beschikkingen" ECHT maken (demo-rij eruit, live render uit beschikkingenDB incl. status §11; export-knop echt of weg).
- [x] Plaatsing: actie "Plaatsing plannen/starten" (reis_status plaatsing_gepland→actief, tijdlijn).
- [x] Verificatie idem fase 1.

## Fase 3 — Actief dossier: zorgplannen, signalering, rapportages, contactlogboek, AI-samenvatting  [x] ✅ AFGEROND 2026-06-10 (PR #622/#623)
- [x] `zorgplannen` (hulpvraag/doelen jsonb/acties/evaluatiemoment/risicoanalyse/signalering + workflow concept→gw_akkoord→ter_ondertekening→actief→geevalueerd→vervangen; §9) + dossier-tab + tekenflow hergebruik fase 2 (zorgplan_id+body_override_html op client_ondertekeningen; ondertekening activeert plan automatisch en vervangt vorige actieve; ook "activeren zonder digitale ondertekening"-pad). RPC's: zorgplan_gw_akkoord (alleen GW/admin-tier via zorgplan_kan_gw_akkoord), zorgplan_ter_ondertekening, zorgplan_activeer, zorgplan_evalueer.
- [x] `signaleringsplannen` (triggers/spanningssignalen/escalatiefases jsonb groen-oranje-rood/interventies/veiligheidsafspraken; §10) + dossier-tab + signaleringsplan_activeer.
- [x] Rapportages-uitbreiding (§8): typen dag/ambulant/evaluatie/contact/incident (+legacy); auteur_id+auteur_naam verplicht; tijd-veld; doelen-koppeling (doel_ids jsonb, checkbox-lijst uit actief zorgplan); RLS aangescherpt (stond VOLLEDIG open): select/insert = client_zorg_toegang (office + gekoppeld + locatie), insert eist auteur_id=auth.uid(), update eigen-of-office, delete office.
- [x] `client_medewerkers`-koppeltabel + Team-blok in vcard (koppelen=beoordelaars; ontkoppelen met slider); koppeling geeft medewerker leestoegang tot dossier (clienten-RLS-branch + current_user_gekoppelde_client_ids()).
- [x] Contactlogboek (§14): `client_contactlog` + dossier-tab (type-filter, eigen-vs-office bewerk-gating, created_by=auth.uid() in RLS).
- [x] Kwaliteit in dossier (§6): Incidenten-tab ECHT (cliënt-gefilterde lijst + klachten- + verbetermaatregelen-sectie); klacht-UI cliënt-picker + Cliënt-kolom; verbeteringsmaatregelen +client_id/incident_id/klacht_id + picker + kolom.
- [x] AI-samenvatting (§7): RPC `client_ai_samenvatting(p_client_id)` (deterministisch; zorgplan/doelen/signaleringsplan/beschikking eind_iso/incidenten 30-90d/laatste rapportage+contact/aandachtspunten rood-oranje-info) + kaart boven de dossier-tabs met Vernieuwen.
- [x] Tijdlijn-triggers (zorgplan/signaleringsplan/rapportage/contactlog/klacht/incident) + nieuwe event-iconen in clientreis-ui.js.
- [x] Verificatie: server-side 41/41 PASS (`scripts/_qa_clientreis_fase3_test.mjs cl_1781104463120_b8a3bf6`) + live 2 clean runs (run 1 licht / run 2 donker) — details voortgangslog.

## Fase 4 — Automatische bewaking  [ ]
- [ ] Dossiercontrole (§12): RPC `client_dossier_controle()` — checks: beschikking ontbreekt/verlopen, zorgplan ontbreekt/verlopen, evaluatie ontbreekt/te laat, handtekeningen ontbreken, signaleringsplan ontbreekt, verplichte documenten ontbreken → `client_dossier_issues`-tabel + dagelijkse cron + dashboardmelding "N dossiers incompleet" + notificaties.
- [ ] Evaluatiebewaking (§13): evaluatiemoment uit zorgplan; meldingen 30/14/0 dagen → GW + zorgcoördinator (patroon beschikking_verloop met eigen log-tabel).
- [ ] Beschikkingsbewaking-UI (§11): waarschuwingsbadges 90/60/30/verlopen in dossier-tab + overzicht.
- [ ] Verificatie idem (incl. cron dry-run server-side).

## Fase 5 — Dashboards + KPI + drill-down  [ ]
- [ ] `clientmodule-dashboard.html`: rol-gegate views — GW-caseload (§17), Zorgcoördinator (§18), Directeur (§19), Eigenaar (§20: cliënten/gemeenten incl. omzet per gemeente via beschikkingen+facturen/demografie (geslacht+leeftijd uit aanmeld-/dossierdata)/producten), KPI-view (§21: aanmeldtrechter, actieve cliënten, verblijfsduur, gemeente-groei, zorginhoudelijke %'s).
- [ ] RPC's `clientdash_*` SECURITY DEFINER met rolcontext-RPC (patroon incident_analyse_context); Finance-view tarieven (§16) alleen finance/admin-tier.
- [ ] Drill-down (§22): dashboard → gefilterde cliëntenlijst (querystring) → dossier.
- [ ] Verificatie: per rol juiste view, 2 clean runs.

## Fase 6 — Uitstroom + nazorg + audittrail-UI + eindcontrole  [ ]
- [ ] Uitstroom (§24): uitstroom-flow in dossier (datum/reden/vervolgplek/eindrapportage-link/nazorgafspraken) → reis_status uitgestroomd; tijdlijn.
- [ ] Nazorg (§25): optioneel traject (contactmomenten/evaluaties/afspraken) → reis_status nazorg → dossier_gesloten.
- [ ] Audittrail-UI (§23): "Geschiedenis"-tab in dossier op audit_log/tijdlijn met oude→nieuwe waarde (trg_audit-details).
- [ ] Autorisatie-eindcontrole (§16): volledige matrix-test per rol (medewerker ziet géén tarieven/financieel/gemeentecontracten; GW caseload; zorgcoörd; finance; directeur/eigenaar alles) — server-side checks + live.
- [ ] Eindverificatie hele cliëntreis end-to-end: aanmelding → … → dossier gesloten, 2 clean runs, alle rollen.

## Test-/verificatieplan (elke fase)
1. Server-side: RPC's per rol via qa-account-JWT's (password grant, anon-key) — bevoegd én onbevoegd.
2. Live via Claude Chrome-extensie op https://futureflow-etf.vercel.app: qa-accounts per rol, licht+donker, 2 opeenvolgende clean runs (één fout = fixen en opnieuw beginnen met run 1). ⚠️ Vóór identity-switch: localStorage `besa-permissions-v2` wissen.
3. Elke knop/modal/validatie van nieuwe UI aanraken; console-fouten = fail.
4. Geen echte e-mails (alleen dry_run); admin-omgevingen read-only.

## Voortgangslog
- 2026-06-10: verkenning afgerond (6-agent audit); plan opgesteld; fase 1 gestart.
- 2026-06-10: **Fase 1 AFGEROND + live** (PR #617). Server-side rolmatrix 17/17 PASS; edge end-to-end (PDF→private bucket, honeypot, validatie); live 2 clean runs (run 1 licht / run 2 donker): portaal→AM-2026-0003/0004, GW meer-info(+verplichte-toelichting-validatie)→zorgcoörd goedkeuren→dossier pill+tijdlijn+contacten, directeur wachtlijst+signed-PDF-check, medewerker+finance fail-closed Geen toegang, audit_log met echte gebruikers. QA-fixtures AM-2026-0001..0004 (cliënten cl_*, reis_status intake_gepland/wachtlijst) BEWUST laten staan: nodig als instroom voor fase 2 (intake/wachtlijst). Bekend cosmetisch punt: clienten.html-sidebar heeft (per-pagina statisch) nog geen Aanmeldingen-link; topnav-dropdown wél — meenemen in fase 2.
- 2026-06-10: **Fase 2 AFGEROND + live** (PR #619 + fix-PR #620). Server-side 22/22 PASS (scripts/_qa_clientreis_fase2_test.mjs); 2 clean runs licht+donker: intake 7 onderdelen+afronden-validatie+afronden, ondertekening end-to-end (canvas→PNG+PDF-akte in private bucket, token-states), wachtlijst KPI's+plaatsing, Volgende-stap-knoppen (plannen/starten/pauzeren/hervatten), beschikkingen-dossier-tab live (badges 90/60/30, tarief-gating: zorgcoörd ZONDER, directeur MET kolom), goedkeuren→auto-intake, medewerker+finance fail-closed. **Bugfix onderweg (PR #620): beschikking-detail-save faalde stil voor alle BS2-geïmporteerde beschikkingen (dual-key cliënt-select) — gold ook vóór fase 2.** QA-fixtures: Sam (AM-2026-0005, intake_gepland) klaar als fase-3-instroom; Liv/Mik/QA-Edge/QA-Test = actief.
- Valkuil-notitie: CDP-screenshots timen soms uit direct na een klik (extensie-glitch); pagina zelf is gezond — verifieer dan via javascript_tool.
- 2026-06-10: **Fase 3 AFGEROND + live** (PR #622 + fix-PR #623). DB-migratie `clientmodule_v2_fase3.sql` idempotent op prod via db-exec. Server-side rolmatrix 41/41 PASS (GW-akkoord-exclusiviteit, tekenflow+PDF+auto-activering, koppeling-als-toegangspad — Sam heeft locatie NULL dus koppeling is het enige pad, auteur/created_by-spoofing geweigerd, finance fail-closed, tijdlijn-events). Live 2 clean runs (run 1 licht / run 2 donker, qa-zorgcoordinator + qa-gedragswetenschapper + qa-medewerker + qa-finance): zorgplan-modal incl. doelen-editor, GW-akkoord+ter-ondertekening+publieke onderteken-pagina end-to-end (incl. ongeldige-token-test en akkoord-checkbox-validatie; plan auto-actief + PDF-akte + vorige vervangen), signaleringsplan activeren (slider), contactlog (validatie+filter+eigen-vs-vreemd gating), team koppelen/ontkoppelen, kwaliteit-secties, AI-kaart, klacht/VM-pickers. **1 bug gevonden+gefixt (PR #623): clientreis_context() geeft rol-NAMEN ("Gedragswetenschapper"), geen slugs — GW-akkoord-knop was onzichtbaar voor GW; lowercase-vergelijking. Run 1 daarna volledig opnieuw.** Valkuilen: onderteken-canvas luistert op mouse/touch-events (niet pointer); slider-confirms via range value=100 + input/change-event + knop; `clientreis_context().rollen` = namen, niet slugs. QA-fixtures op Sam (8+ zorgplannen, 3 signaleringsplannen, rapportages/contactlog/klachten/VM) BEWUST laten staan voor fase 4-6; opruimen bij module-afronding.
