#!/usr/bin/env node
/**
 * check-consistency.mjs — huisstijl-bewaking (ETF Triade).
 *
 * Bewaakt de consistentie-sanering (PR's #126-#138) tegen toekomstige drift.
 * Draait in CI via `npm run build:check` (stap "Cache-busting dry-run") en
 * faalt de build zodra losse waarden i.p.v. de :root-tokens worden gebruikt.
 *
 * Bewust hier (een gewoon script) en niet in .github/workflows/ci.yml: het
 * aanpassen van een workflow-bestand vereist de OAuth `workflow`-scope, die de
 * sandbox niet heeft. Via een npm-script dat CI tóch al draait, staat dezelfde
 * bewaking live zonder die scope.
 *
 * Drie checks (zelfde scope als de bestaande "House-style color consistency"-
 * stap: top-level app-bestanden; scripts/ en node_modules/ vallen erbuiten):
 *   1. ETF-merkkleuren (#3a8fc4/#5f8a23/#cf4b3a/#c2830d) als losse hex in HTML.
 *   2. border-radius:<n>px (losse px) in styles.css / *.html / *.js.
 *   3. font-size:<n>px (losse px) in HTML (inline <style> + style="" + scripts).
 *
 * Toegestaan: var(--token, #fallback), <meta name="theme-color">,
 * border-radius:0 / :50%. styles.css display-fontmaten + JS-injected font-px
 * vallen (nog) buiten check 3 (aparte ronde).
 */
import fs from "node:fs";

const ROOT = process.cwd();
const isHtml = (f) => f.endsWith(".html");
const isJs = (f) => f.endsWith(".js");
const top = fs.readdirSync(ROOT).filter((f) => {
  try { return fs.statSync(f).isFile(); } catch { return false; }
});
const htmlFiles = top.filter(isHtml);
const jsFiles = top.filter(isJs);
const cssFiles = fs.existsSync("styles.css") ? ["styles.css"] : [];

const violations = [];
function scan(files, lineTest, label, hint) {
  for (const f of files) {
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (lineTest(line)) violations.push({ check: label, file: f, line: i + 1, text: line.trim().slice(0, 160), hint });
    });
  }
}

// 1) ETF-merkkleur als losse hex in HTML (niet in var()-fallback of theme-color)
const ETF_HEX = /#(3a8fc4|5f8a23|cf4b3a|c2830d)\b/i;
scan(htmlFiles, (l) => ETF_HEX.test(l) && !/theme-color/i.test(l) && !/var\(--/.test(l),
  "ETF-kleur (HTML)", "Gebruik var(--blue/--green/--red/--yellow).");

// 2) losse border-radius px (css + html + js). var()-radius en 0/50% mogen.
const RAD_PX = /border-radius\s*:\s*[0-9]+px/i;
scan([...cssFiles, ...htmlFiles, ...jsFiles], (l) => RAD_PX.test(l),
  "border-radius px", "Gebruik de --r-* schaal: 4->2xs 5-11->xs 12-15->sm 16-19->md 20-25->lg 26-40->xl 99+->pill.");

// 3) losse font-size px in HTML (niet in var(--font ...))
const FONT_PX = /font-size\s*:\s*[0-9.]+px/i;
scan(htmlFiles, (l) => FONT_PX.test(l) && !/var\(--font/.test(l),
  "font-size px (HTML)", "Gebruik de --font-* ladder.");

if (violations.length) {
  console.error("\n✗ Huisstijl-consistentie: " + violations.length + " overtreding(en) gevonden:\n");
  const byCheck = {};
  for (const v of violations) (byCheck[v.check] ||= []).push(v);
  for (const [check, list] of Object.entries(byCheck)) {
    console.error("  [" + check + "] — " + list[0].hint);
    for (const v of list) console.error("    " + v.file + ":" + v.line + "  " + v.text);
    console.error("");
  }
  console.error("Zie .claude/huisstijl.md (ETF Triade). Gebruik de :root-tokens i.p.v. losse hex/px.\n");
  process.exit(1);
}
console.log("✓ Huisstijl-consistentie OK (ETF-kleuren/hoekrondingen/HTML-fonts via tokens)");
