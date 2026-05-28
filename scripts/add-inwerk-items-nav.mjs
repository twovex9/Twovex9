// Codemod: voeg de "Inwerken"-navigatielink toe direct ná de
// "Contractsjablonen"-link, zowel in de HR-zijbalk (.side-link) als in de HR-
// top-dropdown (.top-dropdown-link), op alle bestaande HTML-pagina's.
// Idempotent: slaat over als de inwerk-items-link er al staat.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const files = readdirSync(root).filter((f) => f.endsWith(".html") && f !== "inwerk-items.html");

const sideRe = /([ \t]*)(<a href="contract-sjablonen" class="side-link[^"]*">Contractsjablonen<\/a>)/;
const dropRe = /([ \t]*)(<a href="contract-sjablonen" class="top-dropdown-link[^"]*" role="menuitem"><span class="top-dropdown-title">Contractsjablonen<\/span><span class="top-dropdown-subtitle">[^<]*<\/span><\/a>)/;

const changed = [];
let sideCount = 0;
let dropCount = 0;

for (const f of files) {
  const p = join(root, f);
  if (!statSync(p).isFile()) continue;
  let html = readFileSync(p, "utf8");
  const orig = html;

  // 1) HR-zijbalk side-link
  if (sideRe.test(html) && !/href="inwerk-items" class="side-link/.test(html)) {
    html = html.replace(sideRe, (m, indent, line) =>
      `${indent}${line}\n${indent}<a href="inwerk-items" class="side-link">Inwerken</a>`);
    sideCount++;
  }

  // 2) HR top-dropdown link
  if (dropRe.test(html) && !/href="inwerk-items" class="top-dropdown-link/.test(html)) {
    html = html.replace(dropRe, (m, indent, line) =>
      `${indent}${line}\n${indent}<a href="inwerk-items" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Inwerken</span><span class="top-dropdown-subtitle">Beheer inwerk-onderdelen</span></a>`);
    dropCount++;
  }

  if (html !== orig) {
    writeFileSync(p, html);
    changed.push(f);
  }
}

console.log(`Bijgewerkt: ${changed.length} bestanden (zijbalk: ${sideCount}, dropdown: ${dropCount}).`);
console.log(changed.join("\n"));
