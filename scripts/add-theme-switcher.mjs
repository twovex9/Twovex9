/* add-theme-switcher.mjs — voegt op elke HTML-pagina in de <head> toe:
 *   1. een kleine inline FOUC-snippet (zet data-theme vóór de eerste paint)
 *   2. <script src="theme.js"> (defer) — injecteert de toggle-knop
 *
 * Idempotent: slaat bestanden over die al gepatcht zijn of geen <head>
 * hebben (bv. partial-snippets). Wijzigt verder NIETS in de bestanden.
 *
 * Run vanuit besa-suite-etf/:  node scripts/add-theme-switcher.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FOUC =
  `<script>(function(){try{var t=localStorage.getItem('besa-theme');` +
  `document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}` +
  `catch(e){document.documentElement.setAttribute('data-theme','light');}})();</script>`;
const LOADER = `<script src="theme.js?v=th1" defer></script>`;
const MARKER = "theme.js?v=th1";

const files = readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"));

let patched = 0;
let skipped = 0;
const skippedNames = [];

for (const name of files) {
  const path = join(ROOT, name);
  const src = readFileSync(path, "utf8");

  if (src.includes(MARKER)) { skipped++; skippedNames.push(name + " (al gepatcht)"); continue; }

  const m = /<head\b[^>]*>/i.exec(src);
  if (!m) { skipped++; skippedNames.push(name + " (geen <head>)"); continue; }

  const insertAt = m.index + m[0].length;
  const inject = `\n  ${FOUC}\n  ${LOADER}`;
  const out = src.slice(0, insertAt) + inject + src.slice(insertAt);
  writeFileSync(path, out, "utf8");
  patched++;
}

console.log(`Gepatcht: ${patched} bestand(en).`);
console.log(`Overgeslagen: ${skipped} -> ${skippedNames.join(", ") || "geen"}`);
