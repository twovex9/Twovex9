#!/usr/bin/env node
/**
 * add-page-loader.mjs — voeg de globale laad-animatie (FOUC-preventie) toe
 * aan de <head> van alle HTML-pagina's.
 *
 * Injecteert, direct NA het bestaande inline thema-snippet (dat data-theme
 * vóór de eerste paint zet), twee dingen:
 *   1. Een inline snippet dat `data-loading="1"` op <html> zet vóór de eerste
 *      paint, plus een harde fallback-timer die het attribuut na 10s weghaalt
 *      (zodat de overlay NOOIT blijft hangen, ook niet als het externe script
 *      faalt te laden).
 *   2. <script src="ff-page-loader.js?v=..." defer> dat het attribuut weghaalt
 *      zodra de echte lay-out geschilderd is.
 *
 * De versie-token (?v=...) wordt per pagina overgenomen van het bestaande
 * theme.js-include; valt terug op een default als die ontbreekt.
 *
 * Idempotent — slaat pagina's over die al een data-loading-snippet hebben.
 * Slaat pagina's zonder het thema-snippet over (bijv. losse HTML-fragmenten).
 *
 * Aanroepen:
 *   node scripts/add-page-loader.mjs            # write
 *   node scripts/add-page-loader.mjs --check    # dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--check") || args.includes("--dry-run");

const DEFAULT_VERSION = "918f1ad";

// Inline snippet: zet data-loading vóór paint + installeer een lichte
// netwerk-teller (window.__ffNet) zodat ff-page-loader.js de overlay pas
// weghaalt wanneer de initiële data-fetches (Supabase) binnen zijn — niet al
// na de eerste lege paint. Plus een harde 15s veiligheidsklep zodat de overlay
// nooit blijft hangen, ook niet als het externe script faalt te laden.
const INLINE_SNIPPET =
  `<script>/*ff-loading*/(function(){try{var d=document.documentElement;` +
  `d.setAttribute('data-loading','1');if(window.__ffNet)return;` +
  `var n={p:0,last:0,t0:Date.now()};window.__ffNet=n;` +
  `if(window.fetch){var of=window.fetch;window.fetch=function(){n.p++;var r;` +
  `try{r=of.apply(this||window,arguments)}catch(e){n.p--;n.last=Date.now();throw e}` +
  `if(r&&typeof r.then==='function'){return r.then(function(x){n.p--;n.last=Date.now();return x},` +
  `function(e){n.p--;n.last=Date.now();throw e})}n.p--;n.last=Date.now();return r}}` +
  `if(window.XMLHttpRequest&&XMLHttpRequest.prototype){var os=XMLHttpRequest.prototype.send;` +
  `XMLHttpRequest.prototype.send=function(){var x=this,done=false;n.p++;` +
  `function fin(){if(done)return;done=true;n.p--;n.last=Date.now()}` +
  `try{x.addEventListener('loadend',fin)}catch(e){}` +
  `try{return os.apply(this,arguments)}catch(e){fin();throw e}}}` +
  `setTimeout(function(){d.removeAttribute('data-loading')},15000)}catch(e){}})();</script>`;

// Bestaand inline snippet (welke versie dan ook) — voor idempotente upgrade.
const EXISTING_SNIPPET_REGEX = /<script>\/\*ff-loading\*\/[^]*?<\/script>/i;

// Anker: het bestaande inline thema-snippet (zet data-theme vóór paint).
const THEME_SNIPPET_REGEX =
  /<script>\(function\(\)\{[^]*?getItem\((['"])ff-theme\1\)[^]*?<\/script>/i;

const htmlFiles = readdirSync(projectRoot)
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(projectRoot, f))
  .filter((f) => statSync(f).isFile());

let added = 0;
let upgraded = 0;
let skipped = 0;
let noAnchor = 0;

for (const file of htmlFiles) {
  const original = readFileSync(file, "utf8");

  // Al een ff-loading-snippet aanwezig? Dan upgraden naar de nieuwste versie
  // (vervang het bestaande inline snippet in-place). Idempotent: als het al
  // identiek is, verandert er niets en slaan we over.
  if (original.includes("/*ff-loading*/")) {
    const existing = original.match(EXISTING_SNIPPET_REGEX);
    if (existing && existing[0] !== INLINE_SNIPPET) {
      const updated = original.replace(existing[0], INLINE_SNIPPET);
      if (!dryRun) writeFileSync(file, updated, "utf8");
      const rel = file.replace(projectRoot, "").replace(/^[\\/]/, "");
      console.log(`  ${rel}: loader-snippet geüpgraded`);
      upgraded++;
    } else {
      skipped++;
    }
    continue;
  }

  const match = original.match(THEME_SNIPPET_REGEX);
  if (!match) {
    noAnchor++;
    continue;
  }

  // Versie-token overnemen van theme.js-include op deze pagina.
  const verMatch = original.match(/theme\.js\?v=([A-Za-z0-9._-]+)/);
  const version = verMatch ? verMatch[1] : DEFAULT_VERSION;
  const loaderScript = `<script src="ff-page-loader.js?v=${version}" defer></script>`;

  // Indent van de anker-regel overnemen.
  const anchorIdx = original.indexOf(match[0]);
  const lineStart = original.lastIndexOf("\n", anchorIdx) + 1;
  const indent = original.slice(lineStart, anchorIdx);

  const replacement =
    match[0] +
    "\n" + indent + INLINE_SNIPPET +
    "\n" + indent + loaderScript;

  const updated = original.replace(match[0], replacement);

  if (!dryRun) {
    writeFileSync(file, updated, "utf8");
  }
  const rel = file.replace(projectRoot, "").replace(/^[\\/]/, "");
  console.log(`  ${rel}: loader toegevoegd (v=${version})`);
  added++;
}

console.log(
  `\n[add-page-loader] ${htmlFiles.length} HTML-bestanden. ` +
  `Toegevoegd: ${added}, Geüpgraded: ${upgraded}, ` +
  `Overgeslagen (al up-to-date): ${skipped}, ` +
  `Geen thema-anker: ${noAnchor}` +
  `${dryRun ? " (dry-run, niets opgeslagen)" : ""}.`
);
