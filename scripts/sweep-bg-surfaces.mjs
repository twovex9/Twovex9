/* sweep-bg-surfaces.mjs — Sweep batch 4.
 * background[-color] met een ZEER LICHTE NEUTRALE hex (min kanaal >= 0xE0,
 * max-min <= 6 -> echt grijs/wit, geen kleurtint) -> var(--ps-XXXXXX).
 * Pure wit (#fff/#ffffff) overgeslagen (batch 2). Achtergrond-only =
 * veilig. Palette-indirectie: light = exact de hex (LIGHT BYTE-IDENTIEK),
 * dark = #1a1f28 (elevated surface). Kleurtinten (#eff6ff/#fef2f2/...)
 * vallen buiten het filter -> latere accenten-batch.
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
function isVeryLightNeutral(h6){
  const r=parseInt(h6.slice(0,2),16), g=parseInt(h6.slice(2,4),16), b=parseInt(h6.slice(4,6),16);
  if (h6==="ffffff") return false;             // batch 2 deed pure wit al
  const min=Math.min(r,g,b), max=Math.max(r,g,b);
  return min>=0xe0 && (max-min)<=6;            // zeer licht én vrijwel kleurloos
}

const used = new Set();
src = src.replace(
  /(^|[;{]\s*)(background(?:-color)?)(\s*:\s*)#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(\s*(?:!important)?\s*)(;|(?=}))/gim,
  (m, pre, prop, colon, hx, bang, end) => {
    const h6 = expand(hx);
    if (!isVeryLightNeutral(h6)) return m;
    used.add(h6);
    return `${pre}${prop}${colon}var(--ps-${h6})${bang}${end}`;
  }
);

src = src.replace(/ C(\d+) /g, (_m, i) => comments[Number(i)]);

if (used.size) {
  const already = new Set(); let x; const re=/--ps-([0-9a-f]{6})\s*:/g;
  while ((x = re.exec(src))) already.add(x[1]);
  const list = [...used].filter(h => !already.has(h)).sort();
  if (list.length) {
    const light = ":root {\n" + list.map(h => `  --ps-${h}: #${h};`).join("\n") + "\n}\n";
    const dark  = '[data-theme="dark"] {\n' + list.map(h => `  --ps-${h}: #1a1f28;`).join("\n") + "\n}\n";
    const block = `\n/* PALETTE surfaces (sweep batch 4) — light = exact, dark = #1a1f28 */\n${light}${dark}`;
    const anchor = "--p-arrow-chip: rgba(20, 24, 33, 0.85);";
    const ai = src.indexOf(anchor);
    const insertAt = ai >= 0 ? src.indexOf("}", ai) + 1 : src.indexOf("}", src.indexOf(":root {")) + 1;
    src = src.slice(0, insertAt) + "\n" + block + src.slice(insertAt);
  }
}

writeFileSync(CSS, src, "utf8");
console.log(`Surface-bg getokeniseerd: ${used.size} distinct zeer-lichte neutralen.`);
