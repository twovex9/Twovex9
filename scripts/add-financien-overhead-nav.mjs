// Idempotente sweep: voeg de "Overhead / kantoor"-sublink toe aan het Financiën-
// dropdown op elke pagina die het al heeft (anker = de "Locaties"-sublink). De link
// wordt voor niet-bevoegde rollen verborgen door permissions-nav-hide.js (strict).
// Run vanuit besa-suite-etf/: `node scripts/add-financien-overhead-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NEW_LINK =
  '<a href="financien-overhead" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Overhead / kantoor</span><span class="top-dropdown-subtitle">Personeel &amp; kantoorkosten buiten de groepen</span></a>';

// Begin van de Locaties-sublink (negeert eventueel aria-current dat erna kan staan).
const ANCHOR_START = '<a href="financien-locaties" class="top-dropdown-link';

let changed = 0, already = 0, noDropdown = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  const idx = html.indexOf(ANCHOR_START);
  if (idx < 0) { noDropdown++; continue; }                 // geen Financiën-dropdown
  if (html.includes('href="financien-overhead"')) { already++; continue; } // idempotent
  const end = html.indexOf("</a>", idx);
  if (end < 0) { noDropdown++; continue; }
  const insertAt = end + "</a>".length;
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);               // whitespace vóór de Locaties-link
  html = html.slice(0, insertAt) + "\n" + indent + NEW_LINK + html.slice(insertAt);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noDropdown=${noDropdown}`);
