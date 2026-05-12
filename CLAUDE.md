# Besa Suite — projectinstructies voor Claude Code

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
- **HTML script-volgorde** (verplicht, in deze volgorde): Supabase CDN → `supabase-client.js` → `besa-sync-reporter.js` → `auth-guard.js` → `profiles-data.js` → relevante `<naam>-data.js` → page-script(s).
- **Auth (Stage 8a+):** `auth-guard.js` op elke pagina behalve `login.html`. RLS sinds 8c is `to authenticated`-only. Auth-fouten centraal afhandelen via `besa-sync-reporter.js` + `besaHandleAuthFailure`.
- **PK/FK types:** check altijd of target-tabel `id` `text` of `uuid` is — match het FK-type exact (zie tabel in werkpatronen sectie 6a-bis).
- **Storage:** bestand-uploads naar Supabase Storage met `storage_path text`-kolom, geen base64 in `text`/`jsonb`.
- **Git (sectie 7):** **na elke logisch afgeronde wijziging direct committen + pushen naar `main`** — niet wachten tot de gebruiker erom vraagt (Vercel-deploy hangt eraan vast). Dit is pre-autorisatie voor `git push origin main` in dit project.
- **Pre-edit checklist** in beide regelbestanden doorlopen voordat een edit wordt afgesloten.

Bij elk verzoek dat afwijkt van de bovenstaande regels: eerst expliciete bevestiging vragen vóór ik afwijk.

## Actief project: BS2 → BS1 port

We bouwen secties van **BESA-suite 2** na in deze codebase met behoud van BS1's eigen stijl en eigen Supabase backend.

### Domeinen & toegangsregels (kritisch — niet vergeten, ook na compactie)

| Site | URL | Mag | Mag NIET |
|---|---|---|---|
| **BS2 (target, sandbox)** | `https://etf.acceptance.besasuite.nl/home` | Alles: klikken, toevoegen, wijzigen, **verwijderen** — bedoeld voor inspectie | — |
| Supabase dashboard | `https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys` | Lezen, navigeren | **Nooit** verwijderen via dashboard; gebruik Supabase MCP voor wijzigingen |
| Vercel dashboard | `https://vercel.com/etfalkmaars-projects/besa-suite` | Lezen, deploys/logs bekijken | **Nooit** verwijderen (project, deploys, env, domains) |
| GitHub repo | `https://github.com/ETFalkmaar/besa-suite-` | Lezen, push naar `main` (geautoriseerd in werkpatronen sec. 7) | Geen `--force` push, geen branch/release-deletes |
| BS1 lokaal | `besa-suite-etf/` | Volledige write conform huisstijl + werkpatronen | — |

User is op alle 4 externe sites al ingelogd in Chrome; per-domein Chrome-extensie permissie moet user éénmalig via popup goedkeuren.

### Werkwijze

- **Plan-file** (volledig stappenplan, Phase 0 pre-flight, risico's): `C:\Users\sonck\.claude\plans\ik-wil-een-beetje-temporal-scott.md`
- **Cross-session memory** (overleeft context-compactie): `C:\Users\sonck\.claude\projects\C--Users-sonck-OneDrive-Desktop-ETF-besa-suite-git-clone\memory\MEMORY.md`
- **BS2 toegang**: gebruiker logt vooraf zelf in op BS2 in Chrome → ik neem tab over via `mcp__Claude_in_Chrome__*` tools. Login-flow nooit zelf uitvoeren met user-credentials.
- **Aanpak per sectie**: inspect BS2 (DOM + DevTools network + screenshots) → datamodel afleiden → migration via `mcp__supabase__apply_migration` (niet `supabase/schema.sql` overschrijven) → bouwen in BS1-stijl conform `huisstijl.md` + `werkpatronen.md` → push naar `main` → Vercel auto-deploy → visueel verifiëren BS1 ↔ BS2 zij-aan-zij.
- **Werksessie-protocol**: pre-flight checks (git / Vercel / Supabase MCP / Chrome ext) verplicht voor we porting-werk starten. Bij hervatting na compactie: memory + plan-file + huisstijl + werkpatronen eerst herlezen.
- **Stijl voor BS2-patronen die niet in BS1 bestaan**: vrij oordeel per geval; design tokens uit `:root` in `styles.css` blijven leidend; nooit nieuwe hex/px-magic numbers introduceren.
- **Tempo & communicatie**: lange autonome runs in blokken van 1,5–2u met korte status-update per blok.
