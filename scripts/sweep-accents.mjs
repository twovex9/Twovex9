/* sweep-accents.mjs — Sweep batch 6 (ROBUUSTE declaratie-parser).
 * Merk-accenten exact gelijk aan een bestaand semantisch token -> token.
 * Light = exact dezelfde hex (LIGHT BYTE-IDENTIEK); dark al geverifieerd:
 *   #2563eb->var(--blue) #dc2626->var(--red) #16a34a->var(--green)
 *   #ca8a04->var(--yellow)
 *
 * Robuust: comments EN url(...) uitgenomen (placeholders); daarna per
 * { } rule-body de declaraties op ';' splitsen en ELKE declaratie precies
 * één keer behandelen (geen terminator-consumptie -> niets overgeslagen,
 * data:-URI's veilig). Declaraties met custom-property (--x:) overgeslagen.
 * Alleen styles.css. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css");
let src = readFileSync(CSS, "utf8");

const comments = [];
src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => { comments.push(m); return ` C${comments.length - 1} `; });
const urls = [];
src = src.replace(/url\([^)]*\)/gi, (m) => { urls.push(m); return `URL${urls.length - 1}URL`; });

const MAP = { "2563eb": "--blue", "dc2626": "--red", "16a34a": "--green", "ca8a04": "--yellow" };
let count = 0;

function fixValue(val) {
  return val.replace(/#([0-9a-fA-F]{6})\b/g, (hm, hx) => {
    const k = hx.toLowerCase();
    if (MAP[k]) { count++; return `var(${MAP[k]})`; }
    return hm;
  });
}

let out = "";
let buf = "";
for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  if (ch === "{") {
    out += buf + ch; buf = "";
  } else if (ch === "}") {
    out += buf
      .split(";")
      .map((decl) => {
        const ci = decl.indexOf(":");
        if (ci < 0) return decl;
        const head = decl.slice(0, ci);
        // property = laatste identifier vóór de ':' (negeer voorafgaande
        // comment-placeholders ' C<n> ' op hetzelfde ;-segment)
        const ids = head.match(/--[a-zA-Z-]+|[a-zA-Z][a-zA-Z-]*/g);
        const propName = ids ? ids[ids.length - 1] : "";
        if (propName.startsWith("--")) return decl;   // token-definitie
        return head + ":" + fixValue(decl.slice(ci + 1));
      })
      .join(";");
    out += ch; buf = "";
  } else {
    buf += ch;
  }
}
out += buf;

out = out.replace(/URL(\d+)URL/g, (_m, n) => urls[Number(n)]);
out = out.replace(/ C(\d+) /g, (_m, n) => comments[Number(n)]);
writeFileSync(CSS, out, "utf8");
console.log(`Merk-accent-hex -> semantisch token: ${count} vervangingen.`);
