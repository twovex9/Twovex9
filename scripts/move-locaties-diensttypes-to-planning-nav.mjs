// move-locaties-diensttypes-to-planning-nav.mjs
// Verplaatst de top-nav links "Locaties" en "Diensttypes" van de HR-dropdown
// naar de Planning-dropdown, en verwijdert de losse "Locaties"-snelkoppeling
// uit de HR-zijbalk. Idempotent: een tweede run wijzigt niets.
//
// Dry-run (alleen rapport):   node scripts/move-locaties-diensttypes-to-planning-nav.mjs
// Toepassen + schrijven:      node scripts/move-locaties-diensttypes-to-planning-nav.mjs --apply
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

// Exacte link-strings (geverifieerd identiek op alle 82 office-pagina's)
const LINK_LOC = '<a href="locaties" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Locaties</span><span class="top-dropdown-subtitle">Beheer locaties</span></a>';
const LINK_DT  = '<a href="hr-diensttypes" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Diensttypes</span><span class="top-dropdown-subtitle">Beheer eigen diensttypes</span></a>';
const SIDE_LOC_VARIANTS = [
  '<a href="locaties" class="side-link">Locaties</a>',
  '<a href="locaties" class="side-link is-active">Locaties</a>',
];
const PLAN_ANCHOR = '<a href="beschikbaarheid-overzicht"';

// Verwijder één link-regel netjes uit een (sub)string: leading indent + trailing newline mee.
// CRLF-bewust: pakt zowel \r\n als \n als trailing line-ending.
function removeLine(block, link) {
  const idx = block.indexOf(link);
  if (idx === -1) return block;
  const lineStart = block.lastIndexOf("\n", idx) + 1; // begin van de regel (na vorige \n)
  let end = idx + link.length;
  if (block[end] === "\r") end++;                      // CRLF: eerst de \r
  if (block[end] === "\n") end++;                      // dan de \n
  return block.slice(0, lineStart) + block.slice(end);
}

// Isoleer een top-dropdown-blok op aria-label en pas fn toe op de body.
// De eerste </div> na de opening sluit de dropdown (geen geneste divs binnenin).
function transformDropdown(html, ariaLabel, fn) {
  const openRe = new RegExp(`<div class="top-dropdown[^"]*" role="menu" aria-label="${ariaLabel}">`);
  const m = html.match(openRe);
  if (!m) return { html, found: false };
  const bodyStart = m.index + m[0].length;
  const closeIdx = html.indexOf("</div>", bodyStart);
  if (closeIdx === -1) return { html, found: false };
  const body = html.slice(bodyStart, closeIdx);
  const newBody = fn(body);
  if (newBody === body) return { html, found: true };
  return { html: html.slice(0, bodyStart) + newBody + html.slice(closeIdx), found: true };
}

let changed = 0;
const warnings = [];
const rows = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  const orig = html;
  const EOL = html.includes("\r\n") ? "\r\n" : "\n"; // respecteer bestands-line-endings
  let didHrRemove = false, didPlanAdd = false, didSide = false;

  // 1. HR-dropdown: verwijder Locaties + Diensttypes (alleen binnen het HR-blok).
  //    Ook de is-active variant (op de eigen pagina krijgt de link 'is-active').
  const active = (link) => link.replace('top-dropdown-link--stacked"', 'top-dropdown-link--stacked is-active"');
  const HR_REMOVE = [LINK_LOC, active(LINK_LOC), LINK_DT, active(LINK_DT)];
  const hr = transformDropdown(html, "HR opties", (body) => {
    let b = body;
    for (const link of HR_REMOVE) {
      if (b.includes(link)) { b = removeLine(b, link); didHrRemove = true; }
    }
    return b;
  });
  html = hr.html;

  // 2. Planning-dropdown: voeg Locaties + Diensttypes toe vóór het beschikbaarheid-anker (idempotent)
  const pl = transformDropdown(html, "Planning opties", (body) => {
    if (body.includes('href="locaties"') || body.includes('href="hr-diensttypes"')) return body; // al verplaatst
    const idx = body.indexOf(PLAN_ANCHOR);
    if (idx === -1) { warnings.push(`${f}: Planning-dropdown zonder anker`); return body; }
    const lineStart = body.lastIndexOf("\n", idx) + 1;
    const indent = body.slice(lineStart, idx);
    didPlanAdd = true;
    return body.slice(0, idx) + LINK_LOC + EOL + indent + LINK_DT + EOL + indent + body.slice(idx);
  });
  html = pl.html;

  // 3. HR-zijbalk: verwijder de losse Locaties-snelkoppeling (normaal + is-active)
  for (const v of SIDE_LOC_VARIANTS) {
    if (html.includes(v)) { html = removeLine(html, v); didSide = true; }
  }

  if (html !== orig) {
    if (APPLY) fs.writeFileSync(p, html, "utf8");
    changed++;
    rows.push(`${didHrRemove ? "HR-" : "   "} ${didPlanAdd ? "PL+" : "   "} ${didSide ? "ZB-" : "   "}  ${f}`);
  }
  // sanity: HR-Locaties verwijderd maar Planning niet toegevoegd?
  if (didHrRemove && !didPlanAdd && !pl.found) warnings.push(`${f}: HR opgeschoond maar GEEN Planning-dropdown!`);
}

console.log(`${APPLY ? "APPLIED" : "DRY-RUN"} — ${changed} bestanden ${APPLY ? "gewijzigd" : "zouden wijzigen"}\n`);
console.log("HR-=verwijderd uit HR  PL+=toegevoegd aan Planning  ZB-=uit zijbalk");
console.log(rows.join("\n"));
if (warnings.length) { console.log("\n⚠ WAARSCHUWINGEN:"); console.log(warnings.join("\n")); }
