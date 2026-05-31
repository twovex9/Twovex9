/**
 * rollout-nav-link.mjs — voegt de "Beschikbaarheid ZZP'ers"-link toe aan de
 * Planning-dropdown in alle HTML-pagina's. Idempotent: pagina's die de link al
 * hebben worden overgeslagen.
 *
 * De link wordt direct ná het "Overzicht planning"-item ingevoegd (dat item komt
 * in alle pagina's met de Planning-dropdown voor → veilig anker).
 *
 * Run vanaf de repo-root van besa-suite-etf:
 *   node scripts/_beschikbaarheid/rollout-nav-link.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Einde van het "Overzicht planning"-anchor — uniek per pagina, indent-onafhankelijk.
const MARKER = 'Bekijk planningsoverzicht</span></a>';

// Het nieuwe dropdown-item (16-spaties indent, matcht de bestaande items).
const NEW_LINK =
  '\n                <a href="beschikbaarheid-overzicht" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem">' +
  '<span class="top-dropdown-title">Beschikbaarheid ZZP\'ers</span>' +
  '<span class="top-dropdown-subtitle">Wie vulde zijn beschikbaarheid in</span></a>';

const ALREADY = 'href="beschikbaarheid-overzicht"';

const files = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
let patched = 0;
let skippedHave = 0;
let skippedNoMarker = 0;
const touched = [];

for (const file of files) {
  const path = join(ROOT, file);
  const html = readFileSync(path, "utf8");
  if (!html.includes(MARKER)) { skippedNoMarker++; continue; }
  if (html.includes(ALREADY)) { skippedHave++; continue; }
  // Voeg de link één keer toe, direct na het eerste voorkomen van de marker.
  const out = html.replace(MARKER, MARKER + NEW_LINK);
  writeFileSync(path, out, "utf8");
  patched++;
  touched.push(file);
}

console.log(`Gepatcht: ${patched}`);
console.log(`Overgeslagen (had link al): ${skippedHave}`);
console.log(`Overgeslagen (geen Planning-dropdown): ${skippedNoMarker}`);
if (touched.length) console.log("Bestanden:\n  " + touched.join("\n  "));
