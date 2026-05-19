/* strip-html-ext.mjs — verwijder ".html" uit interne href/action-links.
 * Werkt samen met vercel.json "cleanUrls": true (serveert /taken i.p.v.
 * /taken.html). Alleen INTERNE relatieve links; externe (http/https//,
 * mailto:, tel:, javascript:, data:, #-anchors) blijven ongemoeid.
 * Query/hash blijven behouden: taken.html?id=5#x -> taken?id=5#x.
 * Alleen *.html in project-root. Idempotent.
 *
 * Run: node scripts/strip-html-ext.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// (href|action)="<intern pad zonder externe scheme>.html"(?=" of ' of ? of #)
const RE = /((?:href|action)\s*=\s*["'])((?!https?:|\/\/|mailto:|tel:|javascript:|data:|#)[^"'#?\s]+?)\.html(?=["'#?])/gi;

const files = readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"));
let totalFiles = 0;
let totalRepl = 0;

for (const name of files) {
  const path = join(ROOT, name);
  const src = readFileSync(path, "utf8");
  let n = 0;
  const out = src.replace(RE, (_m, pre, p) => { n++; return pre + p; });
  if (n > 0) {
    writeFileSync(path, out, "utf8");
    totalFiles++;
    totalRepl += n;
  }
}

console.log(`.html gestript uit interne links: ${totalRepl} links in ${totalFiles} bestanden.`);
