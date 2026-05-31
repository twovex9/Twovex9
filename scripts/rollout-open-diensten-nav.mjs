// Idempotente sweep: voeg de "Open diensten"-link toe aan de Planning-dropdown
// op elke pagina die 'm nog niet heeft. Anker = de "Beschikbaarheid ZZP'ers"-link
// (overal aanwezig); de nieuwe link komt er direct vóór, met dezelfde indentatie.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANCHOR = '<a href="beschikbaarheid-overzicht"';
const LINK =
  '<a href="open-diensten" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem">' +
  '<span class="top-dropdown-title">Open diensten</span>' +
  '<span class="top-dropdown-subtitle">Aanmeldingen op open diensten</span></a>';

let changed = 0, already = 0, noDropdown = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes(ANCHOR)) { noDropdown++; continue; }
  if (html.includes('href="open-diensten"')) { already++; continue; }
  const idx = html.indexOf(ANCHOR);
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);          // whitespace vóór de anker-<a>
  html = html.slice(0, idx) + LINK + "\n" + indent + html.slice(idx);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noDropdown=${noDropdown}`);
