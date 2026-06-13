#!/usr/bin/env node
/**
 * add-ff-audit-include.mjs — voegt <script src="ff-audit.js" defer></script>
 * toe aan elke *.html die profiles-data.js laadt en het nog niet heeft.
 *
 * Plaatsing: direct NA de profiles-data.js-scriptregel (en dus na
 * supabase-client.js + save-feedback.js die in de verplichte volgorde
 * eerder staan), vóór de page-script(s). Idempotent: meermaals draaien =
 * geen dubbele includes. login.html (geen profiles-data.js) wordt
 * bewust overgeslagen — daar valt niets te auditen.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAG = '<script src="ff-audit.js" defer></script>';

const files = fs.readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith(".html"));
let changed = 0, skipped = 0, already = 0;

for (const f of files) {
  const fp = path.join(ROOT, f);
  let src = fs.readFileSync(fp, "utf8");
  if (src.includes("ff-audit.js")) { already++; continue; }

  const lines = src.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("profiles-data.js") && lines[i].includes("<script")) { idx = i; break; }
  }
  if (idx === -1) { skipped++; continue; } // geen profiles-data.js → niet auditen (bv. login.html)

  const indent = (lines[idx].match(/^(\s*)/) || ["", ""])[1];
  lines.splice(idx + 1, 0, indent + TAG);
  fs.writeFileSync(fp, lines.join("\n"));
  changed++;
  console.log("  + " + f);
}

console.log(`\nKlaar: ${changed} gewijzigd, ${already} had het al, ${skipped} overgeslagen (geen profiles-data.js).`);
