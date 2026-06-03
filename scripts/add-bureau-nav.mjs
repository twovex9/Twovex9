// Idempotente sweep: voeg "Detacheringsbureaus" toe aan de Facturen-dropdown,
// direct NA de "Reconciliatie per locatie"-link. Run vanuit besa-suite-etf/:
//   node scripts/add-bureau-nav.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANCHOR = '<a href="zzp-reconciliatie" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Reconciliatie per locatie</span><span class="top-dropdown-subtitle">Verwacht vs binnen/goedgekeurd/nog te komen</span></a>';
const LINK = '<a href="zzp-bureau-facturen" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Detacheringsbureaus</span><span class="top-dropdown-subtitle">Bureau-portaal: uren per locatie + accorderen</span></a>';

let changed = 0, already = 0, noAnchor = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes(ANCHOR)) { noAnchor++; continue; }
  if (html.includes('href="zzp-bureau-facturen"')) { already++; continue; }
  const idx = html.indexOf(ANCHOR);
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);
  const end = idx + ANCHOR.length;
  html = html.slice(0, end) + "\n" + indent + LINK + html.slice(end);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor}`);
