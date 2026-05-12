# Phase 4 — 06: Professional finish — wat kan nog voor 100%

**Datum**: 2026-05-12
**Doel**: gestructureerd overzicht van wat een **echt professional af** BS1 zou hebben, geprioriteerd. Lees als roadmap voor Phase 5 of voor "nice to have" toekomstig werk.

## Prio 1 — Belangrijke functionele afwerking (impact op users)

### 1.1 Cliënt-detail tabs volledige verificatie

**Wat**: client-detail heeft 9 tabs (Details, Beschikkingen, Betalingen, Contacten, Notities, Documenten, Rapportages, Vragenlijsten, Incidenten). Alleen Details + Beschikkingen flow geverifieerd. Andere tabs werken mogelijk niet met geporte data.

**Effort**: ~1 uur (per tab via Chrome MCP testen, fix bugs)

### 1.2 Beschikking-detail tabs verifieren

**Wat**: beschikking-detail heeft tarieven, notities, audit-log tabs. Werken die met BS2-data (b.v. data jsonb extra info)?

**Effort**: ~30 min

### 1.3 Medewerker-detail tabs verifieren

**Wat**: medewerker.html heeft tabs voor NAW, contract, salaris, locaties, opleidingen, certificaten, taakbeoordelingen, verzuim, verlof, notities, documenten. Alle data zit in `data jsonb`. Render correct?

**Effort**: ~1 uur

### 1.4 BS2 dispositions/invoices client_id via aparte endpoint

**Wat**: zie open-items #1. Vereist nieuwe Bearer-token sessie (~30 min user-actie). Voor elke BS1-cliënt fetch `/api/clients/{id}/dispositions` + `/api/clients/{id}/invoices`. Dan beschikkingen.client_id + facturen.client_id resolven.

**Effort**: ~2 uur (script + execute)

**Impact**: BS2 records tonen nu "—" bij cliëntnaam — niet professioneel.

## Prio 2 — Data-kwaliteit + cleanup

### 2.1 Verzuim-mystery onderzoeken

**Wat**: trigger op `medewerkers` checken die mogelijk verzuim-rijen DELETE bij medewerker-archive. Of: het is een tijdelijke glitch.

**Effort**: 15 min (SELECT op `pg_trigger` voor `medewerkers` + `verzuim` tabellen)

### 2.2 Leonie Bakx / Fouad Faiz handmatige merge

**Wat**: vergelijk per persoon de 2 emails. Als zelfde persoon: merge data jsonb in oudste, archive jongste. Als 2 personen: laat staan.

**Effort**: 15 min met user-input.

### 2.3 Complete test-data sweep alle tabellen

**Wat**: scan met `LIKE '%test%'` op alle naam/title/voornaam/achternaam kolommen. Identificeer + archive (met user-confirm).

**Effort**: 30 min

### 2.4 Master-data UUID mapping tabel (`bs2_uuid_map`)

**Wat**: zie open-items #3. Voor toekomstige BS2-sync waar entity-id wordt verzonden, mapping voor FK-resolve.

**Effort**: 1 uur (schema migration + populate uit JSON)

### 2.5 6+6 dedupe records onderzoek

**Wat**: zie open-items #4. Vergelijk JSON met huidige Supabase — was écht gedupliceerd of data verloren?

**Effort**: 30 min

## Prio 3 — UX polish

### 3.1 Planning default-view "auto-jump naar laatste week met data"

**Wat**: detecteer dat huidige week 0 records heeft, spring automatisch naar laatste week met records. OF: toggle "Alle weken" in toolbar.

**Effort**: 1 uur (planning.js code-change + test)

### 3.2 Browser cache invalidatie

**Wat**: `?v=<timestamp>` query-param op JS-script-tags zodat na elke Vercel deploy de cache automatisch wist. Of service worker.

**Effort**: 2 uur (cache-busting script + deploy)

### 3.3 Notification-bell counter sync issue

**Wat**: counter toont 2322 nieuw (audit_log na port). Bij klik markeert als gezien. Maar BS2-import-events zouden mogelijk niet als "nieuw voor user" moeten tellen.

**Effort**: 15 min (set lastSeen = nu, persist)

## Prio 4 — Operations & developer experience

### 4.1 README.md voor de root

**Wat**: project heeft geen "what is this?" intro. Een nieuwe ontwikkelaar of mij over 6 maanden zou eerst een README willen lezen.

**Effort**: 30 min (project intro, quickstart, architectuur diagram, link naar docs/)

### 4.2 Setup-script voor nieuwe machine

**Wat**: één PowerShell script dat een nieuwe machine setupt: clone repo, install deps, configureer .claude/settings.local.json template, env-var check.

**Effort**: 1 uur

### 4.3 CI checks (GitHub Actions)

**Wat**: lint HTML/JS bij elke push, run smoke-tests voor data-laag scripts, verifie dat alle HTML-scripts in juiste volgorde geladen worden.

**Effort**: 2 uur

### 4.4 Backup-strategie

**Wat**: hoe maak je een complete backup van Supabase voor disaster recovery? Documenteer + test.

**Effort**: 1 uur

## Prio 5 — Compliance & security

### 5.1 RLS-policies security audit

**Wat**: alle tabellen hebben `to authenticated using (true)`. Voor productie zou dit fijngraniger moeten (per rol, per medewerker_id). Werkpatronen 8b heeft helpers `is_admin()` + `current_user_rol()` klaar.

**Effort**: 4-8 uur (per tabel policy ontwerpen + testen)

### 5.2 Secrets-leak check

**Wat**: scan repo + history voor accidenteel gecommitte secrets (anon key in supabase-client.js is bekend/intentioneel; service_role zou NIET in repo mogen staan).

**Effort**: 15 min

### 5.3 GDPR Art. 9 voor verzuim

**Wat**: medische data (verzuim) heeft strengere eisen. Logging van wie het heeft gezien, automatische retention-policy, etc.

**Effort**: 4 uur (legal + tech)

## Prio 6 — Nice-to-have

### 6.1 Real-time BS2 → BS1 sync mechanism

**Wat**: in plaats van handmatige Bearer-token exports, een webhook of polling die BS2-changes automatisch detecteert en BS1 update.

**Effort**: 8+ uur, vereist BS2 API access met service-account

### 6.2 Performance benchmarks

**Wat**: 4461 planning records, 990 facturen — UI performance bij filters/sortering? Page-render tijd? Voor groei naar 10k+ records.

**Effort**: 2 uur

### 6.3 E2E test-suite

**Wat**: Playwright tests die de hele BS1-app door-clicken (create cliënt → beschikking → factuur → planning) zodat we niet handmatig elke pagina hoeven verifiëren.

**Effort**: 4-8 uur

## Mijn top-3 aanbevelingen voor "echt klaar"

Als ik **één sessie van 3 uur** zou hebben, zou ik dit doen:

1. **1.1-1.3 + 2.1** (~2.5 uur): alle detail-pages tabs verifiëren + verzuim-mystery onderzoeken. Dat dekt 90% van wat user als "echt werkend" zou willen zien.
2. **4.1** (~30 min): README.md schrijven zodat het project zichzelf kan introduceren.

Als er **één feature gap** open blijft, is dat **1.4** (BS2 dispositions/invoices client_id) — pas dat aan als er een nieuwe BS2-sync sessie wordt gestart.

## Volgende stap

Aanbeveling: doe de top-3 (1.1-1.3, 2.1, 4.1) in deze of volgende sessie. Documenteer alles wat we vinden in `04-open-items.md` (per meta-regel). Daarna kan het project formeel als "v1 productie-ready" beschouwd worden.
