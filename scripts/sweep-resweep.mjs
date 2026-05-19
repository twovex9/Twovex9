/* sweep-resweep.mjs — Gecorrigeerde HER-SWEEP (batch 7).
 * Past de B2–B6 rol-regels in ÉÉN robuuste pass toe en vangt alles wat
 * de oude (terminator-consumerende) regex in batch 3–5 oversloeg.
 *
 * Robuuste parser: comments + url() ge-placeholderd; per { }-body de
 * declaraties op ';' gesplitst; ELKE declaratie 1x; property = laatste
 * identifier vóór ':' (token-defs '--x:' overgeslagen). Reeds omgezette
 * var()-waarden bevatten geen hex -> vanzelf idempotent.
 *
 * Veilig: voor ELKE geëmitteerde --pb-/--ps-/--pt- token die nog niet
 * bestaat wordt een definitie bijgevoegd (light = EXACT de hex -> light
 * byte-identiek; dark = rol-waarde). Geen ongedefinieerde var().
 * Alleen styles.css.
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

const definedTokens = new Set();
{ let x; const re = /--(pb|ps|pt)-([0-9a-f]{6})\s*:/g; while ((x = re.exec(src))) definedTokens.add(`${x[1]}-${x[2]}`); }

const ACCENT = { "2563eb": "--blue", "dc2626": "--red", "16a34a": "--green", "ca8a04": "--yellow" };
const need = new Map(); // "<prefix>-<hex>" -> {prefix,hex,dark}
let count = 0;

function expand(h){ h=h.toLowerCase(); return h.length===3 ? h.split("").map(c=>c+c).join("") : h; }
function rgb(h){ return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function lum(c){ return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255; }
function chroma(c){ return Math.max(...c)-Math.min(...c); }

function register(prefix, hex, dark){
  const key = `${prefix}-${hex}`;
  if (!definedTokens.has(key) && !need.has(key)) need.set(key, { prefix, hex, dark });
  return `var(--${key})`;
}

function roleOf(prop){
  if (prop === "color" || prop === "-webkit-text-fill-color") return "text";
  if (/(^|-)border|outline/.test(prop)) return "line";
  if (prop === "background" || prop === "background-color") return "bg";
  return "other";
}

function mapHex(prop, hx){
  const h = expand(hx);
  if (ACCENT[h]) { count++; return `var(${ACCENT[h]})`; }
  const role = roleOf(prop);
  const c = rgb(h), L = lum(c), C = chroma(c);
  if (role === "bg") {
    if (h === "ffffff") { count++; return "var(--surface)"; }
    if (Math.min(...c) >= 0xe0 && C <= 6) { count++; return register("ps", h, "#1a1f28"); }
    return "#" + hx;
  }
  if (role === "line") {
    if (Math.min(...c) >= 0xc0 && C <= 0x30) { count++; return register("pb", h, "#1f242d"); }
    return "#" + hx;
  }
  if (role === "text") {
    if (L >= 0.70) return "#" + hx;            // licht: tekst-op-accent
    if (C <= 48) {
      const dark = L < 0.30 ? "#f5f6f8" : L < 0.55 ? "#c7ccd6" : "#9aa3b2";
      count++; return register("pt", h, dark);
    }
    return "#" + hx;                            // accent-tekst -> latere batch
  }
  return "#" + hx;                              // box-shadow/fill/stroke -> latere batch
}

let out = "", buf = "";
for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  if (ch === "{") { out += buf + ch; buf = ""; }
  else if (ch === "}") {
    out += buf.split(";").map((decl) => {
      const ci = decl.indexOf(":");
      if (ci < 0) return decl;
      const head = decl.slice(0, ci);
      const ids = head.match(/--[a-zA-Z-]+|[a-zA-Z][a-zA-Z-]*/g);
      const propName = ids ? ids[ids.length - 1] : "";
      if (propName.startsWith("--")) return decl;
      const val = decl.slice(ci + 1).replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
        (m, hx) => mapHex(propName, hx));
      return head + ":" + val;
    }).join(";");
    out += ch; buf = "";
  } else buf += ch;
}
out += buf;

if (need.size) {
  const items = [...need.values()];
  const light = ":root {\n" + items.map(t => `  --${t.prefix}-${t.hex}: #${t.hex};`).join("\n") + "\n}\n";
  const dark  = '[data-theme="dark"] {\n' + items.map(t => `  --${t.prefix}-${t.hex}: ${t.dark};`).join("\n") + "\n}\n";
  const block = `\n/* PALETTE her-sweep (batch 7) — light = exact, dark = rol-waarde */\n${light}${dark}`;
  const anchor = "--p-arrow-chip: rgba(20, 24, 33, 0.85);";
  const ai = out.indexOf(anchor);
  const insertAt = ai >= 0 ? out.indexOf("}", ai) + 1 : out.indexOf("}", out.indexOf(":root {")) + 1;
  out = out.slice(0, insertAt) + "\n" + block + out.slice(insertAt);
}

out = out.replace(/URL(\d+)URL/g, (_m, n) => urls[Number(n)]);
out = out.replace(/ C(\d+) /g, (_m, n) => comments[Number(n)]);
writeFileSync(CSS, out, "utf8");
console.log(`Her-sweep: ${count} vervangingen; ${need.size} nieuwe palette-tokens bijgevoegd.`);
