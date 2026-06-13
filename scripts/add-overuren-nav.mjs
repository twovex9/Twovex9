// Idempotente sweep: voeg "Overuren te beoordelen" toe aan de Facturen-dropdown,
// direct NA de "Proforma's per locatie"-link. Voor niet-bevoegde rollen verbergt
// permissions-nav-hide.js 'm automatisch (allowedRoles incl. Zorgcoördinator).
// Run vanuit future-flow/: `node scripts/add-overuren-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANCHOR = '<a href="zzp-facturen" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Proforma\'s per locatie</span><span class="top-dropdown-subtitle">ZZP-proforma\'s o.b.v. de planning</span></a>';
const LINK = '<a href="zzp-overuren" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Overuren te beoordelen</span><span class="top-dropdown-subtitle">Uren-wijzigingen → planning</span></a>';

let changed = 0, already = 0, noAnchor = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes(ANCHOR)) { noAnchor++; continue; }
  if (html.includes('href="zzp-overuren"')) { already++; continue; }
  const idx = html.indexOf(ANCHOR);
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);
  const end = idx + ANCHOR.length;
  html = html.slice(0, end) + "\n" + indent + LINK + html.slice(end);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor}`);
