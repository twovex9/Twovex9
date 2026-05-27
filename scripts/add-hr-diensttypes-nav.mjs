#!/usr/bin/env node
// Voegt de "Diensttypes"-link toe aan de HR-dropdown van elke HTML-pagina.
// Idempotent — slaat over als de link al aanwezig is.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const NEEDLE = '<a href="hr-diensttypes"';
const ANCHOR = /<a href="salarishuis"[^>]*role="menuitem"><span class="top-dropdown-title">Salarishuis<\/span><span class="top-dropdown-subtitle">[^<]*<\/span><\/a>/;
const INSERT = `<a href="hr-diensttypes" class="top-dropdown-link top-dropdown-link--stacked" role="menuitem"><span class="top-dropdown-title">Diensttypes</span><span class="top-dropdown-subtitle">Beheer eigen diensttypes</span></a>\n                `;

const files = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
let touched = 0, skipped = 0, missing = 0;

for (const f of files) {
  const fp = path.join(ROOT, f);
  let src = fs.readFileSync(fp, "utf8");
  if (src.includes(NEEDLE)) { skipped++; continue; }
  if (!ANCHOR.test(src)) { missing++; continue; }
  src = src.replace(ANCHOR, INSERT + "$&");
  fs.writeFileSync(fp, src);
  touched++;
  console.log("  added →", f);
}
console.log(`\nResultaat: ${touched} toegevoegd · ${skipped} reeds aanwezig · ${missing} geen HR-dropdown`);
