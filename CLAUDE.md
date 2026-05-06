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
