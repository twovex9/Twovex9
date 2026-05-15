#!/usr/bin/env node
/**
 * Bug #77 + #78 fix — Verwijder statische dead placeholders uit topbar-icons div
 * in alle HTML pagina's.
 *
 * Te verwijderen:
 *   - <button class="icon-btn" aria-label="Meldingen">...</button>  (dead bell, no onclick)
 *   - <span class="top-avatar" title="Gebruiker">JS</span>  (hardcoded "JS" placeholder)
 *
 * Te behouden:
 *   - <button class="icon-btn" aria-label="Help">...</button>  (werkt via helpdesk-modal.js)
 *
 * De dynamische notification-bell en user-menu worden geinjecteerd door
 * notification-bell.js resp. auth-guard.js — die blijven werken.
 *
 * Idempotent.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Twee patterns: één voor de dead Meldingen button, één voor de hardcoded JS avatar.
// Beiden mogen onafhankelijk voorkomen (sommige pagina's hebben alleen avatar).
const PAT_MELDINGEN = /\s*<button[^>]*aria-label="Meldingen"[^>]*>[\s\S]*?<\/button>/g;
const PAT_AVATAR = /\s*<span class="top-avatar"[^>]*>JS<\/span>/g;

let touched = 0, unchanged = 0;

for (const f of fs.readdirSync(repoRoot)) {
  if (!f.endsWith(".html")) continue;
  const full = path.join(repoRoot, f);
  const src = fs.readFileSync(full, "utf8");
  let out = src;
  let changed = false;
  if (PAT_MELDINGEN.test(out)) { out = out.replace(PAT_MELDINGEN, ""); changed = true; }
  if (PAT_AVATAR.test(out)) { out = out.replace(PAT_AVATAR, ""); changed = true; }
  if (!changed) { unchanged++; continue; }
  fs.writeFileSync(full, out, "utf8");
  touched++;
}

console.log(`Touched: ${touched}, Unchanged: ${unchanged}`);
