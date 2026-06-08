/**
 * add-mijn-uren-nav.mjs — voegt de persoonlijke tab "Mijn uren" idempotent toe aan:
 *   1. de top-nav van élke pagina (na "Mijn beschikbaarheid"), en
 *   2. de persoonlijke zijbalk (<nav class="side-nav" aria-label="Persoonlijk">) als eerste link.
 *
 * Analoog aan add-mijn-facturen-nav.mjs / add-mijn-beschikbaarheid-nav.mjs.
 * Veilig herhaalbaar: slaat pagina's over die de link al hebben en pagina's
 * zonder de bijbehorende ankerpunten.
 *
 * Run:  node scripts/add-mijn-uren-nav.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TOP_ANCHOR = /<a href="mijn-beschikbaarheid" class="top-link[^"]*">Mijn beschikbaarheid<\/a>/;
const TOP_LINK = '<a href="mijn-uren" class="top-link">Mijn uren</a>';
const SIDE_ANCHOR = /<nav class="side-nav" aria-label="Persoonlijk">/;
const SIDE_LINK = '<a href="mijn-uren" class="side-link">Mijn uren</a>';

const files = readdirSync(ROOT).filter(
  (f) => f.endsWith(".html") && statSync(join(ROOT, f)).isFile()
);

let topPatched = 0, sidePatched = 0, skipped = 0;

for (const file of files) {
  const path = join(ROOT, file);
  let html = readFileSync(path, "utf8");
  const before = html;

  // 1. Top-nav: voeg "Mijn uren" na "Mijn beschikbaarheid" toe (niet op mijn-uren.html zelf,
  //    en niet als de pagina de top-link al heeft).
  const hasTopLink = /<a href="mijn-uren" class="top-link/.test(html);
  if (!hasTopLink && TOP_ANCHOR.test(html)) {
    html = html.replace(TOP_ANCHOR, (m) => `${m}\n            ${TOP_LINK}`);
    topPatched++;
  }

  // 2. Persoonlijke zijbalk: voeg "Mijn uren" als eerste link toe.
  const hasSideLink = /<a href="mijn-uren" class="side-link/.test(html);
  if (!hasSideLink && SIDE_ANCHOR.test(html)) {
    html = html.replace(SIDE_ANCHOR, (m) => `${m}\n        ${SIDE_LINK}`);
    sidePatched++;
  }

  if (html !== before) writeFileSync(path, html, "utf8");
  else skipped++;
}

console.log(`Klaar. top-nav gepatcht: ${topPatched}, zijbalk gepatcht: ${sidePatched}, ongewijzigd: ${skipped} (van ${files.length} html-bestanden).`);
