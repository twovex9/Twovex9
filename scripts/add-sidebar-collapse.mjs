/* add-sidebar-collapse.mjs — voegt de inklapbare-zijbalk-bedrading toe:
 *  1. breidt de bestaande inline FOUC-snippet in <head> uit zodat ook
 *     data-sidebar vóór de eerste paint wordt gezet (geen flits).
 *  2. laadt sidebar-collapse.js (na theme.js) op elke pagina.
 * Idempotent; alleen *.html in root. Wijzigt verder niets.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const THEME_SET = "document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');";
const SIDEBAR_SET =
  "var s=localStorage.getItem('besa-sidebar');" +
  "document.documentElement.setAttribute('data-sidebar',s==='collapsed'?'collapsed':'expanded');";
const THEME_TAG = '<script src="theme.js?v=th1" defer></script>';
const SC_TAG = '<script src="sidebar-collapse.js?v=sc1" defer></script>';

let snippetPatched = 0;
let loaderAdded = 0;

for (const name of readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"))) {
  const path = join(ROOT, name);
  let src = readFileSync(path, "utf8");
  let changed = false;

  // 1. FOUC-snippet uitbreiden (alleen als data-sidebar er nog niet in zit)
  if (src.includes(THEME_SET) && !src.includes("data-sidebar")) {
    src = src.replace(THEME_SET, THEME_SET + SIDEBAR_SET);
    snippetPatched++;
    changed = true;
  }

  // 2. sidebar-collapse.js laden na theme.js
  if (src.includes(THEME_TAG) && !src.includes("sidebar-collapse.js")) {
    src = src.replace(THEME_TAG, THEME_TAG + "\n  " + SC_TAG);
    loaderAdded++;
    changed = true;
  }

  if (changed) writeFileSync(path, src, "utf8");
}

console.log(`FOUC-snippet uitgebreid: ${snippetPatched}; sidebar-collapse.js toegevoegd: ${loaderAdded}.`);
