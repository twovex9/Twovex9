/* sweep-text.mjs — Sweep batch 5.
 * In `color`/`-webkit-text-fill-color` declaraties: NEUTRALE (lage
 * saturatie) DONKERE/MIDDEN hex -> var(--pt-XXXXXX).
 * Palette-indirectie: light = exact de hex (LIGHT BYTE-IDENTIEK).
 * dark = leesbare lichte tekst per luminantie-band:
 *   L<0.30 -> #f5f6f8 ; 0.30<=L<0.55 -> #c7ccd6 ; 0.55<=L<0.70 -> #9aa3b2
 * Overgeslagen: lichte tekst (L>=0.70 = tekst-op-accent, blijft licht) en
 * vivide accent-kleuren (max-min > 48 -> latere accenten-batch).
 * Comment-regio's overgeslagen. Alleen styles.css. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css");
let src = readFileSync(CSS, "utf8");

const comments = [];
src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => { comments.push(m); return ` C${comments.length - 1} `; });

function expand(h){ h=h.toLowerCase(); return h.length===3 ? h.split("").map(c=>c+c).join("") : h; }
function chans(h6){ return [parseInt(h6.slice(0,2),16),parseInt(h6.slice(2,4),16),parseInt(h6.slice(4,6),16)]; }
function lum([r,g,b]){ return (0.2126*r+0.7152*g+0.0722*b)/255; }

function darkFor(h6){
  const c = chans(h6);
  const min=Math.min(...c), max=Math.max(...c);
  if ((max-min) > 48) return null;          // vivide accent -> niet hier
  const L = lum(c);
  if (L >= 0.70) return null;               // lichte tekst-op-accent -> laat staan
  if (L < 0.30)  return "#f5f6f8";
  if (L < 0.55)  return "#c7ccd6";
  return "#9aa3b2";
}

const map = new Map();
src = src.replace(
  /(^|[;{]\s*)(color|-webkit-text-fill-color)(\s*:\s*)#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(\s*(?:!important)?\s*)(;|(?=}))/gim,
  (m, pre, prop, colon, hx, bang, end) => {
    const h6 = expand(hx);
    const dv = darkFor(h6);
    if (!dv) return m;
    map.set(h6, dv);
    return `${pre}${prop}${colon}var(--pt-${h6})${bang}${end}`;
  }
);

src = src.replace(/ C(\d+) /g, (_m, i) => comments[Number(i)]);

if (map.size) {
  const already = new Set(); let x; const re=/--pt-([0-9a-f]{6})\s*:/g;
  while ((x = re.exec(src))) already.add(x[1]);
  const list = [...map.keys()].filter(h => !already.has(h)).sort();
  if (list.length) {
    const light = ":root {\n" + list.map(h => `  --pt-${h}: #${h};`).join("\n") + "\n}\n";
    const dark  = '[data-theme="dark"] {\n' + list.map(h => `  --pt-${h}: ${map.get(h)};`).join("\n") + "\n}\n";
    const block = `\n/* PALETTE text (sweep batch 5) — light = exact, dark = leesbaar licht */\n${light}${dark}`;
    const anchor = "--p-arrow-chip: rgba(20, 24, 33, 0.85);";
    const ai = src.indexOf(anchor);
    const insertAt = ai >= 0 ? src.indexOf("}", ai) + 1 : src.indexOf("}", src.indexOf(":root {")) + 1;
    src = src.slice(0, insertAt) + "\n" + block + src.slice(insertAt);
  }
}

writeFileSync(CSS, src, "utf8");
console.log(`Tekst-hex getokeniseerd: ${map.size} distinct neutrale donkere/midden kleuren.`);
