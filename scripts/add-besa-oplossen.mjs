#!/usr/bin/env node
/**
 * add-besa-oplossen.mjs — voeg <script src="besa-oplossen.js" defer> toe aan
 * alle app-HTML-pagina's, direct NA besa-sync-reporter.js.
 *
 * besa-oplossen.js levert window.besaOplossen (de "Oplossen →"-knop + popover +
 * de resolvers signalFix/notificationFix/clientFix/...). Het wordt o.a. gebruikt
 * door notification-bell.js (in ELKE topbar) en door de dashboards, dus het moet
 * overal geladen zijn — niet alleen op de paar pagina's die het eerst kregen.
 *
 * Het script heeft GEEN afhankelijkheden (puur window/document), dus de plek na
 * besa-sync-reporter.js (vóór de overige data-lagen/page-scripts) is veilig.
 *
 * Idempotent: slaat pagina's over die het al hebben. Slaat pagina's zonder
 * besa-sync-reporter.js over (publieke/portal-fragmenten die de bel niet tonen).
 *
 *   node scripts/add-besa-oplossen.mjs            # write
 *   node scripts/add-besa-oplossen.mjs --check    # dry-run
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const dryRun = process.argv.slice(2).some((a) => a === "--check" || a === "--dry-run");

const REPORTER_RE = /(<script\s+src="besa-sync-reporter\.js[^"]*"[^>]*><\/script>)/i;

let added = 0, skipped = 0, noAnchor = 0;
for (const file of readdirSync(projectRoot)) {
  if (!file.endsWith(".html")) continue;
  const full = join(projectRoot, file);
  let html = readFileSync(full, "utf8");
  if (html.includes("besa-oplossen.js")) { skipped++; continue; }
  const m = html.match(REPORTER_RE);
  if (!m) { noAnchor++; continue; }
  const version = (m[1].match(/\?v=([^"]+)/) || [, "918f1ad"])[1];
  // NIET defer: besa-oplossen.js doet bij load geen DOM-toegang (zet enkel
  // window.besaOplossen), en sommige pagina's hebben een NIET-deferred page-script
  // dat anders eerder draait dan een deferred besa-oplossen.js → window.besaOplossen
  // undefined bij eerste render. Non-defer garandeert beschikbaarheid voor elk
  // page-script, ongeacht hun defer-status.
  const tag = `\n  <script src="besa-oplossen.js?v=${version}"></script>`;
  html = html.replace(REPORTER_RE, `$1${tag}`);
  if (!dryRun) writeFileSync(full, html);
  added++;
  console.log((dryRun ? "[zou toevoegen] " : "[toegevoegd] ") + file);
}
console.log(`\nKlaar: ${added} toegevoegd, ${skipped} hadden het al, ${noAnchor} zonder anker (overgeslagen).`);
