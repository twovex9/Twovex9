// Idempotente sweep: voeg de "Klachten"-link toe aan de Cliënten-dropdown,
// direct ná de "Incidenten"-dropdownlink, op elke pagina die die dropdown heeft.
// Voor niet-bevoegde rollen wordt de link automatisch verborgen door
// permissions-nav-hide.js. Run vanuit future-flow/: `node scripts/add-klachten-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = 'href="incidenten" class="top-dropdown-link';
const LINK = '<a href="klachten" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Klachten</span><span class="top-dropdown-subtitle">Klachtenregister &amp; afhandeling</span></a>';

let changed = 0, already = 0, noAnchor = 0, noNav = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes('class="top-nav"')) { noNav++; continue; }
  if (html.includes('href="klachten"')) { already++; continue; }
  const idx = html.indexOf(MARKER);
  if (idx < 0) { noAnchor++; continue; }              // geen Cliënten-dropdown met Incidenten op deze pagina
  const endIdx = html.indexOf("</a>", idx);
  if (endIdx < 0) { noAnchor++; continue; }
  const insertPos = endIdx + "</a>".length;
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = (html.slice(lineStart, idx).match(/^\s*/) || [""])[0];
  html = html.slice(0, insertPos) + "\n" + indent + LINK + html.slice(insertPos);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`[klachten-nav] changed=${changed} already=${already} noAnchor=${noAnchor} noNav=${noNav}`);
