// Idempotente sweep: voeg een "Mijn beschikbaarheid"-top-link toe direct NA de
// "Mijn facturen"-top-link op elke pagina met de topbar. Open voor elke
// ingelogde gebruiker (page-map null); ZZP'ers geven zo op de PC hun
// beschikbaarheid + tijden door (zelfde plek als Mijn facturen / Mijn uitnodigingen).
// Run vanuit future-flow/: `node scripts/add-mijn-beschikbaarheid-nav.mjs`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Anker = de Mijn-facturen-top-link; tolerant voor een eventuele is-active class.
const ANCHOR_RE = /<a href="mijn-proforma-facturen" class="top-link[^"]*">Mijn facturen<\/a>/;
const LINK = '<a href="mijn-beschikbaarheid" class="top-link">Mijn beschikbaarheid</a>';

let changed = 0, already = 0, noAnchor = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  const m = html.match(ANCHOR_RE);
  if (!m) { noAnchor++; continue; }
  if (html.includes('href="mijn-beschikbaarheid"')) { already++; continue; }
  html = html.replace(m[0], m[0] + "\n            " + LINK);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor}`);
