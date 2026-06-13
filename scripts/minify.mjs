#!/usr/bin/env node
/**
 * minify.mjs — minificeert alle lokale .js en .css in de project-root IN PLACE
 * via esbuild. Draait op de Vercel-build (ephemere checkout) vóór bust-cache,
 * zodat de bust-cache-hash van de GEMINIFICEERDE inhoud klopt. De git-bron
 * blijft volledig onaangeroerd.
 *
 * Waarom: styles.css (~740 KB) is render-blokkerend op élke pagina en de JS
 * wordt onverkleind uitgeleverd. Minificatie verkleint transfer + parse-tijd
 * bij een koude cache.
 *
 * Veiligheid (de site moet exact werken zoals voorheen):
 *  - Alleen actief als process.env.VERCEL gezet is OF --force is meegegeven →
 *    een lokale `npm run build` minificeert je werkboom NIET.
 *  - keepNames:true voor JS → functie-/classnamen blijven behouden.
 *  - Per bestand try/catch: kan esbuild een bestand niet aan, dan blijft het
 *    ORIGINEEL staan en faalt de build niet op één raar bestand.
 *  - Slaat reeds-geminificeerde bestanden (*.min.js / *.min.css) over.
 *  - Raakt alleen de project-root aan (geen scripts/, docs/, node_modules/) —
 *    zelfde scope als bust-cache.mjs.
 *  - Een mislukte build promoot bij Vercel simpelweg de vorige werkende deploy
 *    niet; de live site blijft staan.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const args = process.argv.slice(2);
const force = args.includes("--force");

if (!process.env.VERCEL && !force) {
  console.log("[minify] overgeslagen (geen VERCEL env, geen --force) — lokale werkboom blijft ongemoeid.");
  process.exit(0);
}

const files = readdirSync(projectRoot)
  .filter((f) => /\.(js|css)$/.test(f))
  .filter((f) => !/\.min\.(js|css)$/.test(f))
  .map((f) => join(projectRoot, f))
  .filter((f) => statSync(f).isFile());

let done = 0;
let skipped = 0;
let before = 0;
let after = 0;

for (const file of files) {
  const code = readFileSync(file, "utf8");
  const loader = extname(file) === ".css" ? "css" : "js";
  try {
    const res = await esbuild.transform(code, {
      minify: true,
      keepNames: loader === "js",
      legalComments: "none",
      loader,
    });
    before += Buffer.byteLength(code, "utf8");
    after += Buffer.byteLength(res.code, "utf8");
    writeFileSync(file, res.code, "utf8");
    done += 1;
  } catch (e) {
    skipped += 1;
    const msg = (e && e.message ? e.message : String(e)).split("\n")[0];
    console.warn(`[minify] OVERGESLAGEN (origineel behouden): ${basename(file)} — ${msg}`);
  }
}

const pct = before ? (100 - (after / before) * 100).toFixed(1) : "0";
console.log(
  `[minify] klaar — ${done} geminificeerd, ${skipped} overgeslagen, ` +
  `${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB (-${pct}%).`
);
