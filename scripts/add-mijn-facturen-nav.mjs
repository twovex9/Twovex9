// Idempotente sweep: voeg een "Mijn facturen"-top-link toe direct NA de "Home"-
// top-link op elke pagina met de topbar. Open voor elke ingelogde gebruiker
// (page-map null); ZZP'ers vinden zo hun eigen proforma-facturen.
// Run vanuit future-flow/: `node scripts/add-mijn-facturen-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANCHOR = '<a href="home" class="top-link">Home</a>';
const LINK = '<a href="mijn-proforma-facturen" class="top-link">Mijn facturen</a>';

let changed = 0, already = 0, noAnchor = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes(ANCHOR)) { noAnchor++; continue; }
  if (html.includes('href="mijn-proforma-facturen"')) { already++; continue; }
  html = html.replace(ANCHOR, ANCHOR + "\n            " + LINK);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor}`);
