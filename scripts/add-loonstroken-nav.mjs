/**
 * add-loonstroken-nav.mjs — voegt de sidebar-link "Loonstroken" toe aan elke
 * pagina die de HR-sidebar heeft (herkenbaar aan de "Salarisadministratie"-link),
 * direct ná die link. Idempotent: pagina's die de link al hebben worden
 * overgeslagen. Zelfde patroon als add-bureau-nav.mjs / add-reconciliatie-nav.mjs.
 *
 * Draaien vanuit de repo-root:  node scripts/add-loonstroken-nav.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const NIEUW = '\n        <a href="loonstroken" class="side-link">Loonstroken</a>';
const VARIANTEN = [
  '<a href="salarisadministratie-exporter" class="side-link">Salarisadministratie</a>',
  '<a href="salarisadministratie-exporter" class="side-link is-active">Salarisadministratie</a>',
];

const files = readdirSync(".").filter((f) => f.endsWith(".html"));
let aangepast = 0;
const lijst = [];

for (const f of files) {
  let html = readFileSync(f, "utf8");
  // Al een loonstroken-sidebarlink? Dan overslaan (idempotent).
  if (html.includes('href="loonstroken" class="side-link')) continue;
  // Heeft deze pagina de HR-sidebar?
  const variant = VARIANTEN.find((v) => html.includes(v));
  if (!variant) continue;
  html = html.replace(variant, variant + NIEUW);
  writeFileSync(f, html, "utf8");
  aangepast += 1;
  lijst.push(f);
}

console.log(`Loonstroken-navlink toegevoegd aan ${aangepast} pagina('s).`);
console.log(lijst.join("\n"));
