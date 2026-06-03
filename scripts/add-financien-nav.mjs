// Idempotente sweep: voeg het top-level "Financiën"-dropdownkopje toe aan de
// topbar van elke pagina die het nog niet heeft. Anker = de "Audit"-top-link
// (op vrijwel elke pagina aanwezig); het Financiën-blok komt er direct vóór,
// met dezelfde indentatie. Valt terug op de "Instellingen"-link als Audit ontbreekt.
//
// De link wordt voor niet-bevoegde rollen automatisch verborgen door
// permissions-nav-hide.js (strict: alleen Eigenaar/Directeur). Run vanuit
// besa-suite-etf/: `node scripts/add-financien-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Ankers in voorkeursvolgorde (clean-url én .html-varianten).
const ANCHORS = [
  '<a href="audit" class="top-link',
  '<a href="audit.html" class="top-link',
  '<a href="instellingen" class="top-link',
  '<a href="instellingen.html" class="top-link',
];

const BLOCK = [
  '<div class="top-nav-item top-nav-item--dropdown">',
  '  <a href="financien-locaties" class="top-link top-link--dropdown">Financiën<span class="top-link-chev" aria-hidden="true"></span></a>',
  '  <div class="top-dropdown top-dropdown--hr" role="menu" aria-label="Financiën opties">',
  '    <a href="financien-locaties" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Locaties</span><span class="top-dropdown-subtitle">Kosten, opbrengst &amp; resultaat per locatie</span></a>',
  '  </div>',
  '</div>',
];

let changed = 0, already = 0, noAnchor = 0, noNav = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes('class="top-nav"')) { noNav++; continue; }      // geen topbar (bv. login)
  if (html.includes('href="financien-locaties"')) { already++; continue; } // al aanwezig (idempotent)
  const anchor = ANCHORS.find((a) => html.includes(a));
  if (!anchor) { noAnchor++; console.warn(`  geen anker in ${f}`); continue; }
  const idx = html.indexOf(anchor);
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);                          // whitespace vóór het anker
  const block = BLOCK.join("\n" + indent) + "\n" + indent;
  html = html.slice(0, idx) + block + html.slice(idx);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor} noNav=${noNav}`);
