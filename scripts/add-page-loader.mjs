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
 *   2. <script src="besa-page-loader.js?v=..." defer> dat het attribuut weghaalt
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

// Inline snippet: zet data-loading vóór paint + harde 10s veiligheidsklep.
const INLINE_SNIPPET =
  `<script>/*ff-loading*/(function(){try{var d=document.documentElement;` +
  `d.setAttribute('data-loading','1');setTimeout(function(){` +
  `d.removeAttribute('data-loading');},10000);}catch(e){}})();</script>`;

// Anker: het bestaande inline thema-snippet (zet data-theme vóór paint).
const THEME_SNIPPET_REGEX =
  /<script>\(function\(\)\{[^]*?getItem\((['"])besa-theme\1\)[^]*?<\/script>/i;

const htmlFiles = readdirSync(projectRoot)
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(projectRoot, f))
  .filter((f) => statSync(f).isFile());

let added = 0;
let skipped = 0;
let noAnchor = 0;

for (const file of htmlFiles) {
  const original = readFileSync(file, "utf8");

  // Idempotent: al gedaan?
  if (original.includes("/*ff-loading*/") || /data-loading/.test(original)) {
    skipped++;
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
  const loaderScript = `<script src="besa-page-loader.js?v=${version}" defer></script>`;

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
  `Toegevoegd: ${added}, Overgeslagen (al aanwezig): ${skipped}, ` +
  `Geen thema-anker: ${noAnchor}` +
  `${dryRun ? " (dry-run, niets opgeslagen)" : ""}.`
);
