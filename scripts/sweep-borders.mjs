/* sweep-borders.mjs — Sweep batch 3.
 * In border- en outline-declaraties: vervang NEUTRALE lichtgrijze hex
 * (alle kanalen hoog en dicht bij elkaar = grijs/wit, geen accent) door
 * var(--pb-XXXXXX). Palette-indirectie: light = exact de hex (light blijft
 * byte-identiek), dark = #1f242d (het dark --border-niveau).
 * Accent-gekleurde borders worden NIET aangeraakt (latere batch).
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
function isNeutralLightGray(hex6){
  const r=parseInt(hex6.slice(0,2),16), g=parseInt(hex6.slice(2,4),16), b=parseInt(hex6.slice(4,6),16);
  const min=Math.min(r,g,b), max=Math.max(r,g,b);
  return min>=0xc0 && (max-min)<=0x30;   // licht én laag-verzadigd
}

const used = new Set();
src = src.replace(
  /(^|[;{]\s*)((?:border|outline)[a-z-]*)(\s*:\s*)([^;{}]+?)(\s*)(;|(?=}))/gim,
  (m, pre, prop, colon, val, tail, end) => {
    const newVal = val.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (hm, hx) => {
      const h6 = expand(hx);
      if (!isNeutralLightGray(h6)) return hm;
      used.add(h6);
      return `var(--pb-${h6})`;
    });
    return `${pre}${prop}${colon}${newVal}${tail}${end}`;
  }
);

src = src.replace(/ C(\d+) /g, (_m, i) => comments[Number(i)]);

if (used.size) {
  const already = new Set();
  const existRe = /--pb-([0-9a-f]{6})\s*:/g; let x;
  while ((x = existRe.exec(src))) already.add(x[1]);
  const list = [...used].filter(h => !already.has(h)).sort();
  if (list.length) {
    const lightRule = ":root {\n" + list.map(h => `  --pb-${h}: #${h};`).join("\n") + "\n}\n";
    const darkRule = '[data-theme="dark"] {\n' + list.map(h => `  --pb-${h}: #1f242d;`).join("\n") + "\n}\n";
    const block = `\n/* PALETTE borders (sweep batch 3) — light = exact, dark = #1f242d */\n${lightRule}${darkRule}`;
    const anchor = "--p-arrow-chip: rgba(20, 24, 33, 0.85);";
    const ai = src.indexOf(anchor);
    const insertAt = ai >= 0 ? src.indexOf("}", ai) + 1 : src.indexOf("}", src.indexOf(":root {")) + 1;
    src = src.slice(0, insertAt) + "\n" + block + src.slice(insertAt);
  }
}

writeFileSync(CSS, src, "utf8");
console.log(`Border-hex getokeniseerd: ${used.size} distinct neutrale lichtgrijzen.`);
