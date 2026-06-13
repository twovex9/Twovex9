// Idempotente sweep: voeg de top-level "Dashboard"-link (ETF Management
// Dashboard) toe direct ná de "Home"-link in de topbar van elke pagina.
// Voor niet-bevoegde rollen wordt de link automatisch verborgen door
// permissions-nav-hide.js (strict: alleen Eigenaar/Directeur).
// Run vanuit future-flow/: `node scripts/add-dashboard-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME_END = ">Home</a>";
const LINK = '<a href="management-dashboard" class="top-link">Dashboard</a>';

let changed = 0, already = 0, noAnchor = 0, noNav = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes('class="top-nav"')) { noNav++; continue; }
  if (html.includes('href="management-dashboard"')) { already++; continue; }
  const idx = html.indexOf(HOME_END);
  if (idx < 0) { noAnchor++; console.warn(`  geen Home-link in ${f}`); continue; }
  const insertPos = idx + HOME_END.length;
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = (html.slice(lineStart, idx).match(/^\s*/) || [""])[0];
  html = html.slice(0, insertPos) + "\n" + indent + LINK + html.slice(insertPos);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`[dashboard-nav] changed=${changed} already=${already} noAnchor=${noAnchor} noNav=${noNav}`);
