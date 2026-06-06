// Idempotente sweep: voeg de top-level "SharePoint"-link toe aan de topbar van
// elke office-pagina die 'm nog niet heeft. Plek = direct ná de "Beleid"-link
// (documenten bij elkaar); valt terug op vóór "Audit" / "Instellingen".
//
// De link wordt voor de werkvloer automatisch verborgen door
// permissions-nav-hide.js (sharepoint.html → alleen kantoor-rollen).
// Idempotent (skip als href="sharepoint" al aanwezig) en CRLF-bewust
// (gebruikt de bestands-EOL i.p.v. bare \n). Géén regel-verwijdering, dus
// geen lege-regel-valkuil.
//
// Run vanuit besa-suite-etf/:  node scripts/add-sharepoint-nav.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LINK = '<a href="sharepoint" class="top-link">SharePoint</a>';

// Voorkeur: direct ná de Beleid-link, op dezelfde regel (zoals Taken/Beleid).
const AFTER_BELEID = /<a href="beleid-documenten" class="top-link[^"]*">Beleid<\/a>/;
// Terugval: vóór een van deze ankers (clean-url + .html-varianten).
const BEFORE_ANCHORS = [
  '<a href="audit" class="top-link',
  '<a href="audit.html" class="top-link',
  '<a href="instellingen" class="top-link',
  '<a href="instellingen.html" class="top-link',
];

let changed = 0, already = 0, noAnchor = 0, noNav = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(dir, f);
  let html = fs.readFileSync(p, "utf8");
  if (!html.includes('class="top-nav"')) { noNav++; continue; }       // geen topbar (bv. login)
  if (html.includes('href="sharepoint"')) { already++; continue; }    // al aanwezig (idempotent)
  const eol = html.includes("\r\n") ? "\r\n" : "\n";

  const m = AFTER_BELEID.exec(html);
  if (m) {
    const at = m.index + m[0].length;                                  // direct na </a>
    html = html.slice(0, at) + "            " + LINK + html.slice(at);  // 12 spaties = bestaande tussen-link-spacing
    fs.writeFileSync(p, html, "utf8");
    changed++;
    continue;
  }
  const anchor = BEFORE_ANCHORS.find((a) => html.includes(a));
  if (!anchor) { noAnchor++; console.warn(`  geen anker in ${f}`); continue; }
  const idx = html.indexOf(anchor);
  const lineStart = html.lastIndexOf("\n", idx) + 1;
  const indent = html.slice(lineStart, idx);                           // whitespace vóór het anker
  html = html.slice(0, idx) + LINK + eol + indent + html.slice(idx);
  fs.writeFileSync(p, html, "utf8");
  changed++;
}
console.log(`changed=${changed} already=${already} noAnchor=${noAnchor} noNav=${noNav}`);
