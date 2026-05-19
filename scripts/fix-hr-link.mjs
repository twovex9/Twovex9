/* fix-hr-link.mjs — HR-pagina (index.html) is via cleanUrls onbereikbaar
 * (index.html -> "/" -> redirect /home). Oplossing: serveren op /hr
 * (vercel rewrite). Hier: alle interne href="index" -> href="hr".
 * `index` was uniek de HR/Medewerkers-pagina. Query/hash blijven behouden.
 * Alleen *.html in project-root. Idempotent.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RE = /((?:href|action)\s*=\s*["'])index(?=["'#?])/gi;

let files = 0, repl = 0;
for (const name of readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"))) {
  const path = join(ROOT, name);
  const src = readFileSync(path, "utf8");
  let n = 0;
  const out = src.replace(RE, (_m, pre) => { n++; return pre + "hr"; });
  if (n > 0) { writeFileSync(path, out, "utf8"); files++; repl += n; }
}
console.log(`href="index" -> href="hr": ${repl} links in ${files} bestanden.`);
