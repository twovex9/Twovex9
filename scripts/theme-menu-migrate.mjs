/* theme-menu-migrate.mjs — eenmalige, idempotente patch op alle HTML-pagina's:
 *
 *   1. Maakt de inline FOUC-snippet in de <head> systeem-bewust, zodat de
 *      nieuwe "systeem"-thema-modus ook vóór de eerste paint correct rendert
 *      (anders flitst een OS-donkere gebruiker eerst licht).
 *   2. Verwijdert de hardcoded Help-knop ("?") uit de topbar-icons.
 *
 * Beide bewerkingen zijn idempotent (al-gepatchte bestanden worden overgeslagen)
 * en raken verder NIETS aan. Run vanuit future-flow/:
 *   node scripts/theme-menu-migrate.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const OLD_SNIPPET =
  "var t=localStorage.getItem('ff-theme');" +
  "document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');";
const NEW_SNIPPET =
  "var t=localStorage.getItem('ff-theme');" +
  "var d=t==='dark'||(t==='system'&&window.matchMedia&&" +
  "window.matchMedia('(prefers-color-scheme: dark)').matches);" +
  "document.documentElement.setAttribute('data-theme',d?'dark':'light');";

// Verwijdert het volledige Help-<button>-element (incl. svg + voorafgaande witruimte).
const HELP_BTN_RE =
  /[ \t]*<button[^>]*aria-label="Help"[^>]*>[\s\S]*?<\/button>\s*\r?\n?/g;

const files = readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"));

let snippetPatched = 0;
let helpRemoved = 0;
const touched = [];

for (const name of files) {
  const path = join(ROOT, name);
  let src = readFileSync(path, "utf8");
  const before = src;

  if (src.includes(OLD_SNIPPET)) {
    src = src.split(OLD_SNIPPET).join(NEW_SNIPPET);
    snippetPatched++;
  }

  if (HELP_BTN_RE.test(src)) {
    src = src.replace(HELP_BTN_RE, "");
    helpRemoved++;
  }

  if (src !== before) {
    writeFileSync(path, src, "utf8");
    touched.push(name);
  }
}

console.log(`Inline thema-snippet bijgewerkt: ${snippetPatched} bestand(en).`);
console.log(`Help-knop verwijderd: ${helpRemoved} bestand(en).`);
console.log(`Totaal aangeraakt: ${touched.length} bestand(en).`);
