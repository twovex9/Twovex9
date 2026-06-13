# Future Flow — projectinstructies voor Claude Code

## 🚨 USER HARDCORE-INSTRUCTIE (BINDEND, HOOGSTE PRIORITEIT)

Zie [`docs/phase4/v3-USER-HARDCORE-INSTRUCTIE.md`](docs/phase4/v3-USER-HARDCORE-INSTRUCTIE.md) voor de volledige tekst en werkwijze. Samenvatting:

- **Controleer ALLES per module** (visueel + functioneel + data + permissions + audit-log).
- **2 CLEAN RUNS zonder fix tussendoor** per module.
- **Niet 99,9% maar 100%** voordat ik een module ✅ markeer.
- **Elke knop, dropdown, modal, form-validatie** moet getest worden.
- **User-bevestiging vereist** vóór door naar volgende module.
- **Geen aannames** uit eerdere LOCKDOWN-status — live verifiëren elke keer.

Voortgang per module: zie [`docs/phase4/v3-hardcore-module-checklist.md`](docs/phase4/v3-hardcore-module-checklist.md).

---

Twee regelbestanden zijn bindend en worden elke sessie automatisch geladen via de imports hieronder. Beide moeten worden gevolgd, ook als de gebruiker er niet expliciet om vraagt:

@.claude/huisstijl.md
@.claude/werkpatronen.md

## Korte herinneringen (samenvatting van bovenstaande regels)

- **Supabase = bron van waarheid.** Elke door de gebruiker ingevoerde/bewerkte data direct via een `<naam>-data.js`-laag naar Supabase schrijven met `await`. localStorage alleen als read-cache of voor pure UI-state. Geen silent catches.
- **Stijl:** `index.html` is ground truth. Tokens uit `:root` in `styles.css` (`--text*`, `--line*`, `--blue/red/green/yellow`, `--r-*`, `--font-*`). Verplichte classes: `.topbar`, `.sidebar`, `.content-header`, `.toolbar`, `.table-card`/`.table-wrapper`/`.employees-table`, `.btn-primary`/`.btn-outline`, `.modal-overlay`/`.modal-card`. Geen inline `<style>`, geen losse hex/px voor kleur/radius/font-size.
- **Acties-cel:** archiveren = trash, gearchiveerd = `.btn-outline.hr-restore-btn` (Herstel) **boven** trash in `.hr-row-actions`. Trash = altijd dezelfde 24×24 outline SVG.
- **Bevestigen:** archiveren én verwijderen via `showSliderConfirmModal` / `showArchiveConfirm` (params: `okLabel`/`cancelLabel`). Herstellen = direct, geen modal. Slider-stijl niet aanpassen (12px hoog, vol `var(--blue)` bij 100%, witte thumb met blauwe rand).
- **Feedback:** `showSaveModal`, `showActionFeedback`, `showSliderConfirmModal`, `showArchiveConfirm`. Geen `alert`/`confirm`/`prompt`.
- **Floating panels:** `floating-panels.js` (geen eigen positionering).
- **HTML script-volgorde** (verplicht, in deze volgorde): Supabase CDN → `supabase-client.js` → `ff-sync-reporter.js` → `auth-guard.js` → `profiles-data.js` → relevante `<naam>-data.js` → page-script(s).
- **Auth (Stage 8a+):** `auth-guard.js` op elke pagina behalve `login.html`. RLS sinds 8c is `to authenticated`-only. Auth-fouten centraal afhandelen via `ff-sync-reporter.js` + `ffHandleAuthFailure`.
- **PK/FK types:** check altijd of target-tabel `id` `text` of `uuid` is — match het FK-type exact (zie tabel in werkpatronen sectie 6a-bis).
- **Storage:** bestand-uploads naar Supabase Storage met `storage_path text`-kolom, geen base64 in `text`/`jsonb`.
- **Git (sectie 7):** **na elke logisch afgeronde wijziging direct committen + feature-branch + PR aanmaken**. Claude's sandbox blokkeert directe push naar `main` (hard-coded safety rule). Workflow:
  1. `git switch -c feature/<naam> origin/main`
  2. Commit + `git push -u origin feature/<naam>`
  3. `gh pr create --base main --head feature/<naam>` met heldere summary + test plan
  4. **Zelf mergen ná eigen verificatie** (user-instructie 2026-05-31): verifieer eerst zelf (functioneel + visueel waar relevant; 2-clean-runs blijft), dan `gh pr merge <N> --merge --delete-branch`. De `gh pr merge`-API is niet geblokkeerd (alleen directe `git push` naar main is dat).
  5. Vercel deployed automatisch na merge
  Bij merge-conflicten: `git merge origin/main` in feature-branch, los conflict op, push opnieuw. Géén force-push, géén direct-to-main.

  **PR-output format**: na het mergen rapporteren als **"✅ gemerged (PR #N)"** + de link ter transparantie; user hoeft niet meer te klikken. **Uitzondering — eerst user-confirm:** onomkeerbare/risicovolle acties (data-`DELETE`/`DROP`/`TRUNCATE` per DIEHARD, security, grote/onzekere wijzigingen). Details: werkpatronen sectie 7 + memory `feedback_ff_self_merge`.

- **🚨 04-open-items.md anti-conflict regel** (geüpdatet 2026-05-12 v2):
  - Items 1-28: blijven in `04-open-items.md` (geschiedenis).
  - Items 29+: **aparte file per item** in `docs/phase4/open-items/<NN>-<slug>.md`. Append-at-end (item 28's regel) bleek niet genoeg — twee PR's op dezelfde anchor regel = nog steeds conflict.
  - **Workflow**: maak `<NN>-<slug>.md` met item-inhoud + voeg 1 regel toe aan de index-tabel in `docs/phase4/open-items/README.md`. Conflict-kans = 0% (verschillende files); index-tabel kan minor conflict geven maar makkelijk te resolven.
  - **NIET** items 29+ in `04-open-items.md` inline plaatsen.

- **Pre-edit checklist** in beide regelbestanden doorlopen voordat een edit wordt afgesloten.

Bij elk verzoek dat afwijkt van de bovenstaande regels: eerst expliciete bevestiging vragen vóór ik afwijk.

## Actief project: BS2 → BS1 port — VOLTOOID

We bouwen secties van **BS2** na in deze codebase met behoud van BS1's eigen stijl en eigen Supabase backend.

### Phase status

- ✅ Phase 1: BS2 globale inventaris (`docs/bs2-inventaris.md`)
- ✅ Phase 2: 6 modules + 4 follow-ups (notification-bell, audit-modal, home-polish, notification-prefs M2M)
- ✅ Phase 3: 5092 records data-port via `scripts/bs2-full-import.mjs` met service_role
- ✅ Phase 4: BS2-parity finalization (FK-resolves, status-normalisatie, dedup). Eindrapport: `docs/phase4/99-final-success.md`

### Live eindstand

medewerkers 103 actief, cliënten 93 actief, beschikkingen 251, facturen 990, planning 4461, incidenten 144, verzuim 14, locaties 10 actief, organisaties 90, incident_categorieën 13 actief.

### Bij vervolgsessies (leesvolgorde)

1. **`docs/phase4/v3-complete-bs2-verification-plan.md`** — 🚀 **ACTIEF v3-plan (100% productie-klaar voor 100+ medewerkers)**. 32 user-keuzes + 9 fasen (0→A→B→C→D→E→F→G→I→H). Vind eerste fase met status `⏳ TODO`, voer direct uit. NOOIT vragen "welke fase?".
2. `docs/phase4/v2-master-plan.md` — v2 historie (alle 19 sprints DONE)
3. `docs/phase4/99-v1-eindrapport.md` + `99-v2-eindrapport.md` — eindrapporten voorgaande versies
4. `docs/phase4/open-items/README.md` — items 29+ index
5. Optioneel ouder: `docs/phase4/00-plan.md`, `docs/phase4/99-final-success.md`, `docs/phase4/06-professional-finish.md`

**Workflow-regel v3** (vanaf 2026-05-13):
- Fasen staan in vaste volgorde in v3-plan (0→A→B→C→D→E→F→G→I→H)
- Triple-check per fase + 4-pass eindverificatie in Fase H
- Per gap-fix: feature-branch + PR + "Klik om te mergen" link aan user
- Na merge: status update → ✅ DONE in v3-plan + memory `project_ff_v2_parity.md`
- Bij blocker (rol-omschakeling, service-role-key, DPA-vraag, BS2-sessie verlopen): stop + vraag user
- Eindstand: BS1 100% letterlijk BS2-kopie + productie-klaar met verplichte 2FA, Supabase Pro, DPA's, daily backup, monitoring (Sentry), helpdesk-link, ETF-branded e-mails

Voor toekomstige BS2-data refresh: zie `docs/phase4/open-items/38-bs2-sync-eerste-poging-bevindingen.md` voor v2 aanpak via JS-snippet in browser console (Bearer-token alleen werkt niet).

### Persistente werkwijze-regels (gelden ALTIJD)

1. **Hard rule**: destructieve acties (DELETE/DROP/TRUNCATE) ALTIJD user-confirm vragen.
2. **🚨 ZELF live verifiëren via Chrome MCP** — onderbreek de user NIET met "open de site en check". Open BS1 `https://futureflow-app.vercel.app` via `mcp__Claude_in_Chrome__navigate` + `get_page_text` + `read_page` zelf. Onderbreek alleen wanneer:
   - Een stap volledig afgerond is met rapport
   - User iets fysiek moet doen dat Claude niet kan (service_role key uit dashboard kopiëren, in Supabase Studio handmatig SQL plakken, JS-snippet in BS2 console runnen, etc.)
3. **Doorgaan tot stap klaar is** — niet onderweg pauzeren voor "wil je dit?" tenzij echt destructief.
4. **Bij vragen aan user**: alleen wanneer iets fundamenteel onduidelijk is óf user-actie vereist is. Niet als beleefdheidscheck.
5. **🚨 AUTOMATISCH persisten van uitgesteld werk** — voor ELKE chat-respons waarin ik een van deze trigger-woorden gebruik, MOET ik **vóór** ik het bericht naar user stuur het item toevoegen aan `docs/phase4/04-open-items.md`:

   **Trigger-woorden (NL)**: "voor toekomst", "later", "niet-kritiek", "v2", "open item", "minor", "uitstellen", "doe ik later", "stelt zich uit", "moet nog gebeuren", "nog te doen", "nog niet kritiek", "kan later", "TODO", "voor een volgende sessie", "voor nu skip", "feature gap", "bekend issue".

   **Trigger-woorden (EN)**: "for the future", "later", "not critical", "v2", "open item", "minor", "todo", "deferred", "to be done", "for a future session", "future iteration", "follow-up".

   **Werkwijze** bij detectie van trigger-woord in mijn eigen tekst:
   1. Pause vóór bericht-verzenden
   2. Append nieuw genummerd item aan `docs/phase4/04-open-items.md` met: titel, status, oplossing, vereisten
   3. Commit + push (kan in dezelfde commit als ander werk)
   4. In het user-bericht een korte verwijzing: "(toegevoegd aan `04-open-items.md` item #N)"

   **Geldt voor ELK bericht**, ook tussentijdse status-updates. Niet alleen voor eindrapporten.

   **Bij elke nieuwe sessie**: eerst `04-open-items.md` herlezen — direct na CLAUDE.md.

### Domeinen & toegangsregels (kritisch — niet vergeten, ook na compactie)

| Site | URL | Mag | Mag NIET |
|---|---|---|---|
| **BS2 (target, sandbox)** | `https://etf.acceptance.besasuite.nl/home` | Alles: klikken, toevoegen, wijzigen, **verwijderen** — bedoeld voor inspectie | — |
| Supabase dashboard | `https://supabase.com/dashboard/project/ukjflilnhigozfoxowmj` | Lezen, navigeren | **Nooit** verwijderen via dashboard; gebruik Supabase MCP voor wijzigingen |
| Vercel dashboard | `https://vercel.com/etfalkmaars-projects/futureflow-app` | Lezen, deploys/logs bekijken | **Nooit** verwijderen (project, deploys, env, domains) |
| GitHub repo | `https://github.com/twovex9/twovex9` | Lezen, push naar `main` (geautoriseerd in werkpatronen sec. 7) | Geen `--force` push, geen branch/release-deletes |
| BS1 lokaal | `future-flow/` | Volledige write conform huisstijl + werkpatronen | — |

User is op alle 4 externe sites al ingelogd in Chrome; per-domein Chrome-extensie permissie moet user éénmalig via popup goedkeuren.

### Werkwijze

- **Plan-file** (volledig stappenplan, Phase 0 pre-flight, risico's): `C:\Users\sonck\.claude\plans\ik-wil-een-beetje-temporal-scott.md`
- **Cross-session memory** (overleeft context-compactie): `C:\Users\sonck\.claude\projects\C--Users-sonck-OneDrive-Desktop-ETF-Future Flow-git-clone\memory\MEMORY.md`
- **BS2 toegang**: gebruiker logt vooraf zelf in op BS2 in Chrome → ik neem tab over via `mcp__Claude_in_Chrome__*` tools. Login-flow nooit zelf uitvoeren met user-credentials.
- **Aanpak per sectie**: inspect BS2 (DOM + DevTools network + screenshots) → datamodel afleiden → migration via `mcp__supabase__apply_migration` (niet `supabase/schema.sql` overschrijven) → bouwen in BS1-stijl conform `huisstijl.md` + `werkpatronen.md` → push naar `main` → Vercel auto-deploy → visueel verifiëren BS1 ↔ BS2 zij-aan-zij.
- **Werksessie-protocol**: pre-flight checks (git / Vercel / Supabase MCP / Chrome ext) verplicht voor we porting-werk starten. Bij hervatting na compactie: memory + plan-file + huisstijl + werkpatronen eerst herlezen.
- **Stijl voor BS2-patronen die niet in BS1 bestaan**: vrij oordeel per geval; design tokens uit `:root` in `styles.css` blijven leidend; nooit nieuwe hex/px-magic numbers introduceren.
- **Tempo & communicatie**: lange autonome runs in blokken van 1,5–2u met korte status-update per blok.
