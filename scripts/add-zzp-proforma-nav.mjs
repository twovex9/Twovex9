// Idempotente sweep: voeg de "Proforma's per locatie"-link toe als EERSTE item
// in de Facturen-dropdown van elke pagina die die dropdown heeft. Anker = de
// bestaande "Te beoordelen"-dropdownlink (href="facturen-te-beoordelen" met
// class top-dropdown-link). De link wordt voor niet-bevoegde rollen automatisch
// verborgen door permissions-nav-hide.js (action view / entity invoices).
// Run vanuit future-flow/: `node scripts/add-zzp-proforma-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ANCHOR = '<a href="facturen-te-beoordelen" class="top-dropdown-link';
const LINK =
  '<a href="zzp-facturen" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem">' +
  '<span class="top-dropdown-title">Proforma\'s per locatie</span>' +
  '<span class="top-dropdown-subtitle">ZZP-proforma\'s o.b.v. de planning</span></a>';

let changed = 0, already = 0, noAnchor = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes(ANCHOR)) { noAnchor++; continue; }                 // geen Facturen-dropdown
  if (html.includes('href="zzp-facturen"')) { already++; continue; }    // al aanwezig (idempotent)
  const idx = html.indexOf(ANCHOR);
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);                            // whitespace vóór het anker
  html = html.slice(0, idx) + LINK + "\n" + indent + html.slice(idx);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor}`);
